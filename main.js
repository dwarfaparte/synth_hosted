import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';

//  RAYCASTING & OUTLINE VARIABLES 
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let selectedObject = null; // <-- RENAMED
let outlinePass;
let hoveredInteractive = null;

// Button Groups
const b_group1 = ['B_Soft01','B_Soft02','B_Soft03','B_Soft04'];
const b_group2 = ['B_Soft05','B_Soft06','B_Soft07','B_Soft08'];    
const b_group3 = ['B_TimeMod', 'B_Gate', 'B_Accent', 'B_Glide', 'B_Octave', 'B_NoteSynth'];

//  DRAG & ROTATION VARIABLES 
let isDragging = false;
const previousMousePosition = {
    x: 0,
    y: 0
    };
    let rotationVelocityY = 0; // <-- ADD: Stores the current spin speed
    const INERTIA_DAMPING = 0.97; // <-- ADD: Friction (0.9 = fast stop, 0.99 = long drift)
    const DRAG_SENSITIVITY = 0.005; // <-- ADD: Your existing sensitivity as a constant

// --- DISPLAY & DATA VARIABLES ---
let descriptionDisplayElement; 
let debugDisplayElement; 
let currentDescriptionText = ""; 
let knobDescriptions = new Map();
let softButtonStates = new Map(); // Key: Object Name (e.g., 'soft1'), Value: State (0, 1, or 2)

function resetButtonLEDs(targetButton) {
    const grouplist = [b_group1, b_group2, b_group3];

    // Find targetButton in groups
    for (const group of grouplist) {
        if (group.includes(targetButton)) {
            // Reset all buttons in this group  
            for (const buttonName of group) {
                setButtonLEDs([buttonName], 0, 0);
                //softButtonStates.set(buttonName, 0); // Reset state to 0
                }   
            }
        }
    }

    // Sets the LED brightness for a list of soft buttons by name.
    // @param {string[]} buttonNames - An array of button names (e.g., ['Soft01', 'Soft02']).
    // @param {number} greenIntensity - The desired emissive intensity for the green LED.
    // @param {number} redIntensity - The desired emissive intensity for the red LED.
    
function setButtonLEDs(buttonNames, greenIntensity, redIntensity) {
    if (!modelToFadeIn) return; // Make sure the model is loaded

    for (const buttonName of buttonNames) {
        // Find the button object in the scene
        const buttonObject = scene.getObjectByName(buttonName);

        if (!buttonObject) {
            console.warn(`setButtonLEDs: Button "${buttonName}" not found.`);
            continue; // Skip to the next button name
        }

        let redLEDMaterial = null;
        let greenLEDMaterial = null;

        // Find the LED materials (using the same logic as your onMouseClick handler)
        buttonObject.traverse((child) => {
            if (child.isMesh) {
                // This handles both single and multi-material meshes
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                
                materials.forEach(mat => {
                    if (mat.name.includes('redLED')) redLEDMaterial = mat;
                    if (mat.name.includes('greenLED')) greenLEDMaterial = mat;
                });
            }
        });

        // Set the new intensities
        if (redLEDMaterial && greenLEDMaterial) {
            redLEDMaterial.emissiveIntensity = redIntensity;
            greenLEDMaterial.emissiveIntensity = greenIntensity;

            // IMPORTANT: Tell Three.js to update the materials
            redLEDMaterial.needsUpdate = true;
            greenLEDMaterial.needsUpdate = true;
        } else {
            console.warn(`setButtonLEDs: Could not find LED materials for button: ${buttonName}`);
        }
    }
}

// --- CSV DATA LOADING (Only for Knobs) ---
async function loadKnobData() {
    try {
        const response = await fetch('tooltips.csv');
        const data = await response.text();
        const lines = data.split('\n'); 
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                const commaIndex = line.indexOf(',');
                if (commaIndex !== -1) {
                    const name = line.substring(0, commaIndex).trim();
                    const description = line.substring(commaIndex + 1).trim().replace(/^"|"$/g, ''); 
                    knobDescriptions.set(name, description);
                }
            }
        }
        console.log('Knob descriptions loaded:', knobDescriptions);
    } catch (error) {
        console.error('Error loading CSV data:', error);
    }
}


/**
 * Creates a THREE.CanvasTexture with a 4x2 grid of text, with 3 lines per block.
 * @param {string} displayName - The name of the display ("Display01" or "Display02")
 * @param {string[][]} textArray - An array of 8 arrays, each containing 3 strings.
 * @param {number} [width=512] - Canvas width.
 * @param {number} [height=128] - Canvas height.
 * @returns {THREE.CanvasTexture}
 */
function createTextTexture(displayName, textArray, width = 512, height = 128) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    
    // Crispy pixel setting
    ctx.imageSmoothingEnabled = false; 

    // Background
    ctx.fillStyle = '#0a0a0a'; // Dark screen background
    ctx.fillRect(0, 0, width, height);

    // --- Define Grid ---
    const cols = 4;
    const rows = 2;
    const blockWidth = width / cols;
    const blockHeight = height / rows;

    // --- Draw Grid Lines ---
    ctx.strokeStyle = '#334444'; // Dark cyan, fits the theme
    ctx.lineWidth = 2;

    // 3 Vertical lines
    for (let i = 1; i < cols; i++) {
        ctx.beginPath();
        ctx.moveTo(i * blockWidth, 0);
        ctx.lineTo(i * blockWidth, height);
        ctx.stroke();
    }
    // 1 Horizontal line
    ctx.beginPath();
    ctx.moveTo(0, blockHeight);
    ctx.lineTo(width, blockHeight);
    ctx.stroke();

    // --- Draw Text in Blocks ---
    ctx.fillStyle = '#70bdc0'; // Use your outline color for the text
    
    // NEW: Smaller font size to fit three lines
    const fontSize = blockHeight * 0.3; // 22% of block height
    ctx.font = `bold ${fontSize}px "Press Start 2P", monospace`; 
    
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle'; // Align text vertically to the Y-coordinate

    for (let i = 0; i < 8; i++) {
        // NEW: Get the array [line1, line2, line3] for this block
        const textBlock = textArray[i] || ["", "", ""]; 
        const line1 = textBlock[0] || "";
        const line2 = textBlock[1] || "";
        const line3 = textBlock[2] || ""; // NEW: Third line

        // Calculate grid position
        const col = i % cols;
        const row = Math.floor(i / cols);

        // Calculate center X
        const centerX = (col * blockWidth) + (blockWidth / 2);
        
        // NEW: Calculate Y positions for 3 lines, relative to the block's top
        const blockTopY = row * blockHeight;
        const line1Y = blockTopY + (blockHeight * 0.25); // Position at 25% down
        const line2Y = blockTopY + (blockHeight * 0.50); // Position at 50% down
        const line3Y = blockTopY + (blockHeight * 0.75); // Position at 75% down

        // Draw the three lines
        if (line1) {
            ctx.fillText(line1, centerX, line1Y);
        }
        if (line2) {
            ctx.fillText(line2, centerX, line2Y);
        }
        if (line3) { // NEW: Draw third line
            ctx.fillText(line3, centerX, line3Y);
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false;
    texture.wrapS = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy(); // Improves quality
    
    return texture;
}

// --- DISPLAY TEXT LOADING (NEW) ---
// This will store: Map<'Display01', Map<'ScreenName', string[][]>>
// e.g., allDisplayScreensData.get('Display01').get('--- MAIN SCREEN ---')
let allDisplayScreensData = new Map();
let displayScreensPromise; // To await this in the loader

/**
 * Parses a 6x4 grid of CSV cells into the 8x3 block array needed by createTextTexture.
 * Row 1-3 of CSV -> Lines 1-3 for top 4 blocks
 * Row 4-6 of CSV -> Lines 1-3 for bottom 4 blocks
 * @param {string[][]} grid - A 6x4 array of strings from the CSV.
 * @returns {string[][]} An 8x3 array for createTextTexture.
 */
function processGridData(grid) {
    const processed = [];
    // NEW: Read 3 lines for each section
    const topRow1 = grid[0] || []; // L1s for blocks 1-4
    const topRow2 = grid[1] || []; // L2s for blocks 1-4
    const topRow3 = grid[2] || []; // L3s for blocks 1-4
    const btmRow1 = grid[3] || []; // L1s for blocks 5-8
    const btmRow2 = grid[4] || []; // L2s for blocks 5-8
    const btmRow3 = grid[5] || []; // L3s for blocks 5-8

    // Process top row blocks (index 0-3)
    for (let i = 0; i < 4; i++) {
        // NEW: Push a 3-element array
        processed.push([ topRow1[i] || "", topRow2[i] || "", topRow3[i] || "" ]);
    }
    // Process bottom row blocks (index 4-7)
    for (let i = 0; i < 4; i++) {
        // NEW: Push a 3-element array
        processed.push([ btmRow1[i] || "", btmRow2[i] || "", btmRow3[i] || "" ]);
    }
    return processed; // This will be an 8x3 array
}

/**
 * Parses the new display CSV format (header + 4x4 grid).
 * @param {string} csvText - The raw text content of the CSV file.
 * @returns {Map<string, string[][]>} A map where key is screen name, value is 8x2 text array.
 */
/**
 * Parses the new display CSV format (header + 4x4 grid).
 * @param {string} csvText - The raw text content of the CSV file.
 * @returns {Map<string, string[][]>} A map where key is screen name, value is 8x2 text array.
 */
function parseDisplayCSV(csvText) {
    // --- DEBUG 4: Check Input to Parser ---
    console.log('parseDisplayCSV: Received text with length:', csvText ? csvText.length : 'null');
    // --- End Debug ---

    const screensMap = new Map();
    const lines = csvText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    let currentScreenName = null;
    let currentScreenGrid = [];

    for (const line of lines) {
        
        // --- DEBUG 5: Check Parser Logic ---
        console.log(`parseDisplayCSV: Processing line: "${line}"`);
        // --- End Debug ---

        // --- NEW, MORE ROBUST HEADER CHECK ---
        // 1. Split by comma first to handle stray commas
        const parts = line.split(',');
        
        // 2. Clean the *first part* of the line
        const potentialHeader = parts[0].trim().replace(/^"|"$/g, '');

        // 3. Check if *that part* matches the '*' pattern
        if (potentialHeader.startsWith('*')) {
            
            // This IS a header line
            if (currentScreenName && currentScreenGrid.length > 0) {
                const processedData = processGridData(currentScreenGrid);
                screensMap.set(currentScreenName, processedData);
            }
            
            // Use the cleaned header name
            currentScreenName = potentialHeader; 
            
            // --- DEBUG 6: Found a Header ---
            console.log('parseDisplayCSV: FOUND NEW SCREEN HEADER:', currentScreenName);
            // --- End Debug ---
            
            currentScreenGrid = []; // Reset the grid
        } else if (currentScreenName) {
            // This is a data line for the current screen
            // RE-USE the 'parts' variable from above
            const rowData = parts.slice(1).map(cell => cell.trim().replace(/^"|"$/g, ''));
            currentScreenGrid.push(rowData);
        } else {
            // --- DEBUG 7: Skipped a Line ---
            console.warn('parseDisplayCSV: Skipped line (no current screen header set):', line);
            // --- End Debug ---
        }
    }

    // After the loop, save the very last screen
    if (currentScreenName && currentScreenGrid.length > 0) {
        const processedData = processGridData(currentScreenGrid);
        screensMap.set(currentScreenName, processedData);
    }
    
    // --- DEBUG 8: Check Parser Output ---
    console.log('parseDisplayCSV: Finished parsing. Returning map:', screensMap);
    // --- End Debug ---
    
    return screensMap;
}

/**
 * Fetches and parses both display CSV files.
 */
async function loadAllDisplayScreens() {
    try {
        const [display1Response, display2Response] = await Promise.all([
            fetch('Display_01.csv'),
            fetch('Display_02.csv')
        ]);

        const display1Text = await display1Response.text();
        const display2Text = await display2Response.text();

        allDisplayScreensData.set('Display01', parseDisplayCSV(display1Text));
        allDisplayScreensData.set('Display02', parseDisplayCSV(display2Text));
        
        console.log('All display screens loaded:', allDisplayScreensData);
    } catch (error) {
        console.error('Error loading display CSV data:', error);
    }
}

// Start loading knob and display data
loadKnobData();
displayScreensPromise = loadAllDisplayScreens(); // 
// --- NEW: createTextTexture function restored ---
// ... (Your existing createTextTexture function starts here, no changes needed) ...

// Start loading knob data
loadKnobData();

// --- PULSE VARIABLES ---
let clock = new THREE.Clock();
const PULSE_MIN_INTENSITY = 8; 
const PULSE_MAX_INTENSITY = 8.5; 
const PULSE_SPEED = 2; 

// --- FADE-IN & ZOOM-IN VARIABLES ---
let modelToFadeIn; 
let isFadingIn = false; // intro sequence is running

// Zoom-in variables
const INITIAL_RADIUS = 70;
const FINAL_RADIUS = 40; 
const MIN_ZOOM_RADIUS = 10;
const MAX_ZOOM_RADIUS = 70;

const EASE_FACTOR = 0.02; 
const DEFAULT_ROTATION_X = THREE.MathUtils.degToRad(330);
let currentRadius = INITIAL_RADIUS;

// --- CAMERA FOCUS VARIABLES ---
let isCameraFocused = false; // Is the camera in a zoomed-in, focused state?
let isCameraTransitioning = false; // Is the camera currently transitioning?
let targetCameraPosition = new THREE.Vector3(); // Where the camera should move to
let targetLookAt = new THREE.Vector3(0, 0, 0); // Where the camera should look
let lerpedLookAt = new THREE.Vector3(0, 0, 0); // For smooth lookAt transitions
let targetCameraUp = new THREE.Vector3(0, 1, 0); // <-- NEW: Camera's "up" vector
let lerpedCameraUp = new THREE.Vector3(0, 1, 0); // <-- NEW: Smoothed "up" vector
let targetModelRotationY = 0;
const CAMERA_FOCUS_SPEED = 0.05; // Speed for smooth transition (0 to 1)

// 1. Setup the Scene, Camera, and Renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(20, window.innerWidth / window.innerHeight, 0.1, 1000)
const renderer = new THREE.WebGLRenderer({ antiallias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
document.body.appendChild(renderer.domElement);

// --- BACKGROUND TEXTURE LOADING ---
const textureLoader = new THREE.TextureLoader();
const backgroundPath = 'Synth Model/skybox_bright.jpg';

textureLoader.load(
    backgroundPath,
    function(texture) {
        scene.background = texture;
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture; // Set environment for reflections
    },
    undefined,
    function(error) {
        console.error('An error happened while loading the background texture:', error);
        scene.background = new THREE.Color(0xcccccc);
    }
);

// 2. Add Lighting
let ambientLight = new THREE.AmbientLight(0xffffff, PULSE_MIN_INTENSITY); 
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 3);
directionalLight.position.set(5, 100, 20.5);
scene.add(directionalLight);

// 3. Load the Model
const loader = new GLTFLoader();

loader.load(
    'Synth Model/synth_model.glb',
    async function (gltf) { // <-- 1. MAKE THIS ASYNC
        modelToFadeIn = gltf.scene;
        modelToFadeIn.rotation.x = DEFAULT_ROTATION_X;
        modelToFadeIn.rotation.y = THREE.MathUtils.degToRad(45);
        targetModelRotationY = modelToFadeIn.rotation.y;
        modelToFadeIn.position.x = 0;
        modelToFadeIn.position.y = 0;

        // --- 2. AWAIT YOUR DISPLAY DATA ---
        await displayScreensPromise; 

    // --- 3. MODIFY THE TRAVERSE LOGIC ---
        modelToFadeIn.traverse((child) => {
            if (child.isMesh && child.material) {
                
                // --- BLOCK 1: Your existing logic to set up displays ---
                // This runs first, turning the displays into emissive materials.
                if (child.name === 'Display01' || child.name === 'Display02') {
                    const defaultArray = [
                        ["1-1", "1-2", "1-3"], ["2-1", "2-2", "2-3"], 
                        ["3-1", "3-2", "3-3"], ["4-1", "4-2", "4-3"],
                        ["5-1", "5-2", "5-3"], ["6-1", "6-2", "6-3"], 
                        ["7-1", "7-2", "7-3"], ["8-1", "8-2", "8-3"]]
                    
                    // --- NEW LOGIC TO GET DEFAULT SCREEN ---
                    const screensForThisDisplay = allDisplayScreensData.get(child.name);
                    let textArray = defaultArray; // Fallback

                    if (screensForThisDisplay && screensForThisDisplay.size > 0) {
                        // Get the data for the *first* screen found in the CSV
                        textArray = screensForThisDisplay.values().next().value;
                    }
                    const texture = createTextTexture(child.name, textArray); 

                    const processMaterial = (material) => {
                        material.map = texture;
                        material.emissiveMap = texture; // Make the text glow
                        material.emissive = new THREE.Color(0xffffff); // Glow full white
                        material.emissiveIntensity = 0.5; // Adjust glow brightness
                        material.toneMapped = false; // Makes the glow pop more
                        material.needsUpdate = true;
                    };
                    Array.isArray(child.material) ? child.material.forEach(processMaterial) : processMaterial(child.material);
                } 

                // --- - Add lights to ALL emissive materials ---
                // This helper function checks a material and adds a light if needed
                let addLights = false; // <-- Set to false to disable emissive lights
                if (!addLights) return; // Skip if disabled
                const addLightIfEmissive = (material) => {
                    // Check if material is emissive (color is not black AND intensity > 0)
                    if (material.emissive && material.emissiveIntensity > 0 && material.emissive.getHex() !== 0) {
                        // --- Create the PointLight ---
                        const light = new THREE.PointLight(
                            material.emissive.clone(),    // Use the material's emissive color
                            material.emissiveIntensity * 1.0, // Tweak this intensity multiplier!
                            10 // Tweak this distance! (0 = infinite)
                        );
                        
                        // Place the light at the center of the mesh
                        light.position.set(0, 0, 0); 
                        
                        // Parent the light to the mesh so it moves with it
                        child.add(light);

                        console.log(`Added PointLight to emissive mesh: ${child.name}`);
                    }
                };

                // Run the helper function on the mesh's material(s)
                if (Array.isArray(child.material)) {
                    child.material.forEach(addLightIfEmissive);
                } else {
                    addLightIfEmissive(child.material);
                }
                // --- End of Block 2 ---
            }
        });

        scene.add(modelToFadeIn);

        // Set Button intial states
        resetButtonLEDs('B_Soft01');
        setButtonLEDs(['B_Soft01'], 0, 5);
        resetButtonLEDs('B_Soft05');
        setButtonLEDs(['B_Soft05'], 0, 5);
        resetButtonLEDs('B_TimeMod');
        setButtonLEDs(['B_TimeMod'], 0, 5);

        //isFadingIn = true; // Waits for start button
        console.log('Model loaded, starting fade-in and curved zoom-in!');
    },
    undefined,
    function (error) {
        console.error('An error happened while loading the model:', error);
    }
);

// 4. Angle the Camera (45 degrees looking down)
const angle = THREE.MathUtils.degToRad(75);

camera.position.x = 0;
camera.position.y = INITIAL_RADIUS * Math.sin(angle); // Set initial position
camera.position.z = INITIAL_RADIUS * Math.cos(angle); // Set initial position
camera.lookAt(0, 0, 0);

// 6. Setup Post-Processing (Effect Composer)
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// --- OutlinePass for hover effect ---
outlinePass = new OutlinePass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 
    scene, 
    camera
);
outlinePass.edgeStrength = 3.0;
outlinePass.edgeGlow = 0.5;   
outlinePass.edgeThickness = 1.0;
outlinePass.visibleEdgeColor.set('#70bdc0'); // User's new color
outlinePass.hiddenEdgeColor.set('#110011');
composer.addPass(outlinePass);

// FilmPass for grain/noise effect
const filmPass = new FilmPass(
    0.35, 0.025, 648, false
);
filmPass.renderToScreen = true;
composer.addPass(filmPass);

// --- MODIFIED: Mouse Move Handler for Raycasting ---
function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}
window.addEventListener('mousemove', onMouseMove, false);

// --- Mouse Click Handler for Interaction ---
function onMouseClick(event) {
    // Don't register a click if we are dragging
    if (isDragging /*|| isCameraTransitioning*/) return;

    // Set mouse position for raycaster
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Check intersections immediately on click
    checkIntersections(true); // <-- Pass 'true' to indicate a click action
}

renderer.domElement.addEventListener('click', onMouseClick, false);

// --- Model Rotation / Drag Logic ---
function onDragStart(event) {
    isDragging = true;
    rotationVelocityY = 0;
         
    // ---  Hide knob GUI on drag start ---
    if (descriptionDisplayElement) descriptionDisplayElement.style.display = 'none';
    currentDescriptionText = "";

    // Snap back to default flat rotation when click starts
    if (modelToFadeIn) {
        modelToFadeIn.rotation.x = DEFAULT_ROTATION_X;
        modelToFadeIn.rotation.z = 0; // Reset any z-axis float
    }

    // Get initial position
    const clientX = event.clientX || event.touches[0].clientX;
    const clientY = event.clientY || event.touches[0].clientY;
    
    previousMousePosition.x = clientX;
    previousMousePosition.y = clientY;
}
function onDragMove(event) {
    if (!isDragging || !modelToFadeIn || isCameraFocused) return;
    
// --- NEW: Reset camera focus on DRAG ---
    if (isCameraFocused && !scrollHappened) {
        isCameraFocused = false;
        isCameraTransitioning = true;
        // The animate loop will handle lerping back
    }

    const clientX = event.clientX || event.touches[0].clientX;
    const clientY = event.clientY || event.touches[0].clientY;

    // Calculate delta
    const deltaX = clientX - previousMousePosition.x;
    //const deltaY = clientY - previousMousePosition.y;
    rotationVelocityY = deltaX * DRAG_SENSITIVITY;
    // Apply rotation to the model
    // Apply the rotation to make it stick to the mouse
    modelToFadeIn.rotation.y += rotationVelocityY;
    //modelToFadeIn.rotation.x += deltaY * 0.001;

    // Store new position
    previousMousePosition.x = clientX;
    previousMousePosition.y = clientY;
}
function onDragEnd() {
    isDragging = false;
}

// Add mouse drag listeners to the canvas
renderer.domElement.addEventListener('mousedown', onDragStart, false);
renderer.domElement.addEventListener('mousemove', onDragMove, false);
renderer.domElement.addEventListener('mouseup', onDragEnd, false);
renderer.domElement.addEventListener('mouseleave', onDragEnd, false);

// --- Mouse Wheel Zoom Logic ---
// This variable acts as your "flag"
let scrollHappened = false;

// The listener just sets the flag to true
window.addEventListener('wheel', (event) => {
  scrollHappened = 10;
})

function onMouseWheel(event) {
    event.preventDefault(); // Stop page from scrolling

    // Adjust currentRadius based on wheel delta
    // You can adjust 0.05 sensitivity
    currentRadius += event.deltaY * 0.05;

    // Clamp the radius to the min/max limits
    currentRadius = Math.max(MIN_ZOOM_RADIUS, Math.min(MAX_ZOOM_RADIUS, currentRadius));
}
renderer.domElement.addEventListener('wheel', onMouseWheel, false);

function checkIntersections(isClick = false) { 
    // Don't raycast if dragging
    if (isDragging) return;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(modelToFadeIn, true); 

    hoveredInteractive = null; 

    if (intersects.length > 0) {
        let objectToCheck = intersects[0].object;
        while (objectToCheck) {
            if (objectToCheck.name) {
                // Check for Knobs or Displays
                if (objectToCheck.name.includes('Knob') 
                    || objectToCheck.name === 'Display01' 
                    || objectToCheck.name === 'Display02' 
                    || objectToCheck.name.includes('B_')) {
                    hoveredInteractive = objectToCheck; // Found an object
                    console.log('Hovered object name:', objectToCheck.name);
                    const worldPos = new THREE.Vector3();
                    hoveredInteractive.updateMatrixWorld(true)
                    hoveredInteractive.getWorldPosition(worldPos);
                    console.log(`${hoveredInteractive.name} world position: x=${worldPos.x.toFixed(3)}, y=${worldPos.y.toFixed(3)}, z=${worldPos.z.toFixed(3)}`, worldPos);
                    break;
                }
            }
            objectToCheck = objectToCheck.parent;
        }
    }

    if (isCameraFocused && scrollHappened > 0) {
            
            // ...then un-focus the camera.
            isCameraFocused = false;
            isCameraTransitioning = true;
            
            // Also hide GUI and deselect objects, same as onDragStart
            if (descriptionDisplayElement) descriptionDisplayElement.style.display = 'none';
            currentDescriptionText = "";
            selectedObject = null;
            outlinePass.selectedObjects = [];

            return; // We're done, un-focusing is the only action needed.
        }

    if (isClick 
        && hoveredInteractive
        && isCameraFocused === false
        && (hoveredInteractive.name === 'Display01' 
        || hoveredInteractive.name === 'Display02')) {
        isCameraFocused = true;
        isCameraTransitioning = true;
        rotationVelocityY = 0;
        targetModelRotationY = 0;
        
        // --- 1. Get the Knob10 object ---
        const targetObject = scene.getObjectByName("Knob10");
        if (!targetObject) {
            console.error("Could not find 'Knob10' to focus on!");
            return;
        }

        // Calculate target camera position slightly in front of the display
        const displayWorldPos = new THREE.Vector3();
        targetObject.updateMatrixWorld(true);
        targetObject.getWorldPosition(displayWorldPos);
        const displayNormal = new THREE.Vector3(0, 1, 0);
        displayNormal.applyQuaternion(targetObject.getWorldQuaternion(new THREE.Quaternion()));
        const offsetDistance = 15;
        targetCameraPosition.copy(displayWorldPos).addScaledVector(displayNormal, offsetDistance);
        
        // Look directly at the center of the display
        targetLookAt.copy(displayWorldPos); 
        // Set camera "up" vector to match display's up direction
        const displayUp = new THREE.Vector3(0, 1, 0);
        displayUp.applyQuaternion(targetObject.getWorldQuaternion(new THREE.Quaternion()));
        targetCameraUp.copy(displayUp);
        return; // Stop processing, we've handled the display click
    }
    // --- SOFT BUTTON CLICK LOGIC --

    if (isClick && hoveredInteractive && hoveredInteractive.name.includes('B_')) {
        const buttonName = hoveredInteractive.name;
        
        // 1. Get the current state (default to 0 if new)
        let currentState = softButtonStates.get(buttonName) || 0;

        // 2. Cycle the state (0 -> 1 -> 0)
        currentState = (currentState + 1) % 2;
        softButtonStates.set(buttonName, currentState);
        
        console.log(`${buttonName} clicked. New state: ${currentState}`);
        
        // 4. Apply the new emission intensity based on the state
            resetButtonLEDs(buttonName); // Reset other buttons in the group first
            switch (currentState) {
                case 0:
                    // State 0: Red bright (5), Green dim (0.2)
                    setButtonLEDs([buttonName], 5, 0)
                    break;
                case 1:
                    // State 1: Green bright (5), Red dim (0.2)
                    setButtonLEDs([buttonName], 0, 5)
                    break;
            }        
        
        // Clear hover/selection effect immediately after click
        selectedObject = null;
        outlinePass.selectedObjects = [];
        return; // Stop processing, we've handled the soft button click
    }

    // --- STICKY LOGIC FOR ALL GUI ---
    if (hoveredInteractive && hoveredInteractive !== selectedObject) {
        selectedObject = hoveredInteractive;
        outlinePass.selectedObjects = [selectedObject];
        
        // Now, decide which GUI to show
        if (selectedObject.name.includes('Knob')) {
            // --- It's a Knob ---
            // REMOVED: hideGuiDisplayCanvas(); // Hide display GUI
            
            // Show knob description
            const objectName = selectedObject.name;
            const description = knobDescriptions.get(objectName);
            
            if (description && description !== currentDescriptionText) {
                if (descriptionDisplayElement) {
                    descriptionDisplayElement.style.display = 'block'; 
                    descriptionDisplayElement.innerHTML = description;
                    currentDescriptionText = description; 
                    descriptionDisplayElement.style.transform = 'scale(1.1)'; 

                    setTimeout(() => {
                        if (descriptionDisplayElement) {
                            descriptionDisplayElement.style.transform = 'scale(1)'; 
                        }
                    }, 150); 
                }
            }
        }
    } else if (!hoveredInteractive && selectedObject) { 
        // Mouse is on no object, but an object is still selected
        selectedObject = null;
        outlinePass.selectedObjects = [];
        
        // Hide all GUIs
        if (descriptionDisplayElement) descriptionDisplayElement.style.display = 'none';
        currentDescriptionText = "";
    }
}

// 7. Animation Loop (Render the Scene)
function animate() {
    requestAnimationFrame(animate);

    // --- PULSE LOGIC ---
    const elapsedTime = clock.getElapsedTime(); 
    const pulseFactor = Math.sin(elapsedTime * PULSE_SPEED) * 0.5 + 0.5; 
    const newIntensity = PULSE_MIN_INTENSITY + (PULSE_MAX_INTENSITY - PULSE_MIN_INTENSITY) * pulseFactor;
    ambientLight.intensity = newIntensity;

    // --- BLINK LOGIC ---
    const isBlinkOn = (Math.floor(elapsedTime * 2) % 2 === 0);
    scrollHappened -= 1
    if (scrollHappened <= 0){
        scrollHappened = 0
    }

    // ---  INTRO ZOOM ---
    if (isFadingIn && modelToFadeIn) {
        
        // CURVED ZOOM-IN (Intro anim)
        if (currentRadius > FINAL_RADIUS) {
            const distanceRemaining = currentRadius - FINAL_RADIUS;
            const zoomStep = distanceRemaining * EASE_FACTOR;
            currentRadius -= zoomStep;
            if (distanceRemaining < 0.01) { 
                currentRadius = FINAL_RADIUS; 
                isFadingIn = false; // <-- Set flag to false HERE
                console.log('Intro sequence complete.');
            }
        } else {
             // Also handle case where we are already at or past the zoom
             isFadingIn = false;
        }
    }
    
// --- Model Rotation LERP & Inertia Logic ---
    if (modelToFadeIn) {
        // If we are dragging, the onDragMove function handles rotation.
        // If not dragging, we need to handle LERP (for focus) or Inertia (for drift).
        if (!isDragging) {
             // LERP the model's Y-rotation to its target
            modelToFadeIn.rotation.y = THREE.MathUtils.lerp(
                modelToFadeIn.rotation.y, 
                targetModelRotationY,
                CAMERA_FOCUS_SPEED // Use the same speed as camera
            );

            // Only apply inertia if NOT focused and NOT transitioning
            // (The transition flag is set to false when it arrives)
            if (!isCameraFocused && !isCameraTransitioning && rotationVelocityY !== 0) {
                // Apply the drift rotation
                modelToFadeIn.rotation.y += rotationVelocityY;
                
                // Apply damping (friction)
                rotationVelocityY *= INERTIA_DAMPING;
                
                // Stop if velocity is negligible
                if (Math.abs(rotationVelocityY) < 0.0001) {
                    rotationVelocityY = 0;
                }
            }
        }
    }

    // --- Check if camera has arrived at its destination ---
    if (isCameraTransitioning) {
        const distanceToTarget = camera.position.distanceTo(targetCameraPosition);
        // If we are very close, stop the transition
        if (distanceToTarget < 0.01) {
            isCameraTransitioning = false;
        }
    }

   // --- Camera Position Logic
    if (isCameraFocused) {
        // Targets are set by checkIntersections on click
    } else {
        // We are in default mode. Set targets *every frame*
        // to account for wheel-based 'currentRadius' changes.
        targetCameraPosition.set(
            0,
            currentRadius * Math.sin(angle),
            currentRadius * Math.cos(angle)
        );
        targetLookAt.set(0, 0, 0);
        targetCameraUp.set(0, 1, 0); // Reset "up" vector to world default

        if (!isDragging && modelToFadeIn) {
             targetModelRotationY = modelToFadeIn.rotation.y;
        }
    }
    
    // Always lerp to the current target position, lookAt point, and up vector
    camera.position.lerp(targetCameraPosition, CAMERA_FOCUS_SPEED);
    lerpedLookAt.lerp(targetLookAt, CAMERA_FOCUS_SPEED);
    lerpedCameraUp.lerp(targetCameraUp, CAMERA_FOCUS_SPEED); //
    
    // Apply the "up" vector *before* calling lookAt
    camera.up.copy(lerpedCameraUp); // 
    camera.lookAt(lerpedLookAt);
    // --- END REPLACED ---

    // --- Call Raycasting Logic ---
    if (modelToFadeIn) {
        checkIntersections(false); 
        if (debugDisplayElement) {
            const rotation = modelToFadeIn.rotation;
            
            // Convert radians to degrees and format to 2 decimal places
            const rotX = THREE.MathUtils.radToDeg(rotation.x).toFixed(2);
            const rotY = THREE.MathUtils.radToDeg(rotation.y).toFixed(2);
            const rotZ = THREE.MathUtils.radToDeg(rotation.z).toFixed(2);

            // Use \n (newline) for textContent, or <br> for innerHTML
            // Using 'white-space: pre' in the CSS makes \n work well.
           if (debugDisplayElement) {
            
            // 1. THIS LINE MUST BE HERE to define 'hoveredName'
            const hoveredName = hoveredInteractive ? hoveredInteractive.name : "null"; 
            
            // 2. THIS LINE then uses it
            debugDisplayElement.textContent = `--- STATES ---
            isCameraFocused: ${isCameraFocused}
            scrollHappened: ${scrollHappened}
            hoveredInteractive: ${hoveredInteractive}`;
        }
        }
    }

    // Render via the EffectComposer
    composer.render();
}

// --- Get Display Element from DOM ---
descriptionDisplayElement = document.getElementById('description-display');
debugDisplayElement = document.getElementById('debug-display');

// --- Fullscreen & Landscape Lock Logic ---
const startOverlay = document.getElementById('start-overlay');
const startButton = document.getElementById('start-button');

// --- startExperience function ---
async function startExperience() {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    try {
        if (isMobile /*&& screen.orientation && screen.orientation.lock*/) {
            await document.documentElement.requestFullscreen();
            if (screen.orientation && screen.orientation.lock) {
                await screen.orientation.lock("landscape");
            }
        }
    } catch (error) {
        console.warn("Could not enter fullscreen or lock orientation:", error);
    } finally {
        // Hide the start button overlay
        startOverlay.style.display = 'none';
        
        // Get the new fade overlay and trigger the fade-out
        const fadeOverlay = document.getElementById('fade-overlay');
        if (fadeOverlay) {
            fadeOverlay.style.opacity = '0';
        }
        
        // Start the zoom-in animation
        isFadingIn = true; 
    }
}

startButton.addEventListener('click', startExperience);
animate();

// 8. Handle Window Resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight); 
    outlinePass.resolution.set(window.innerWidth, window.innerHeight);
});
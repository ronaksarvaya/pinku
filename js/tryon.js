import { supabase } from "./supabase-config.js";

// =================================================================
// === VITON-HD API INTEGRATION CONFIGURATION ===
// =================================================================
let API_BASE_URL = localStorage.getItem("api_url") || ""; // Load from storage or empty

// ── HF Token (session-only, never permanently stored) ─────────────
function getSessionHFToken() {
    return sessionStorage.getItem("hf_token") || null;
}
function setSessionHFToken(token) {
    sessionStorage.setItem("hf_token", token);
}
function clearSessionHFToken() {
    sessionStorage.removeItem("hf_token");
}
const POLLING_INTERVAL = 1000;

// Expose function to update URL from UI
window.updateApiUrl = function (url) {
    if (url.endsWith("/")) url = url.slice(0, -1); // Remove trailing slash
    API_BASE_URL = url;
    localStorage.setItem("api_url", url);
    console.log("API URL Updated:", API_BASE_URL);
    // Optional: Test connection
    fetch(API_BASE_URL + "/").then(r => r.json()).then(d => Swal.fire("Connected!", "Server is online.", "success")).catch(e => Swal.fire("Error", "Could not reach server.", "error"));
};

// Check if URL is set on load
if (!API_BASE_URL) {
    // Swal.fire("Setup Required", "Please paste your Colab/Ngrok URL in the sidebar.", "info");
} else {
    // Populate input if exists
    const input = document.getElementById("api-url");
    if (input) input.value = API_BASE_URL;
}

let currentStyle = "formal";
let uploadedImage = null; // Base64 of the person image
let selectedCloth = null; // Base64 of the selected clothing item
const accessories = {
    glasses: null,
    watch: null,
    chain: null,
    earring: null,
    bag: null,
    shoes: null
};

// DOM Elements
const userImageInput = document.getElementById('user-image');
const previewImg = document.getElementById('preview');
const tryonResult = document.getElementById('tryon-result'); // Target for the AI result
const aiTryonBtn = document.getElementById('ai-tryon-btn'); // New: For disabling

const glassesInput = document.getElementById('glasses-image');
const watchInput = document.getElementById('watch-image');
const chainInput = document.getElementById('chain-image');
const earringInput = document.getElementById('earring-image');
const bagInput = document.getElementById('bag-image');
const shoesInput = document.getElementById('shoes-image');


// --- Loader Helpers (Existing) ---
function showLoader(message) {
    document.querySelector('.loading-text').textContent = message || 'Loading...';
    document.getElementById('loading-overlay').style.display = 'flex';
    aiTryonBtn.disabled = true; // Button disable karein
}
function hideLoader() {
    document.getElementById('loading-overlay').style.display = 'none';
    aiTryonBtn.disabled = false; // Button re-enable karein
}


// --- API TRIGGER FUNCTION (CRASH-PROOF LOCALHOST) ---
window.triggerApiTryon = async function () {
    const userImageFile = document.getElementById('user-image').files[0];

    // Find the currently selected clothing file from any of the upload inputs
    const clothInputIds = ['shirt-upload', 'tshirt-upload', 'pant-upload', 'jacket-upload'];
    let clothFile = null;

    for (const id of clothInputIds) {
        const input = document.getElementById(id);
        if (input && input.files.length > 0) {
            clothFile = input.files[0];
            break;
        }
    }

    // If no manual upload, check if we have a selectedCloth (from Combo or Retry)
    if (!clothFile && selectedCloth) {
        try {
            console.log("Fetching cloth from selectedCloth:", selectedCloth);
            const response = await fetch(selectedCloth);
            const blob = await response.blob();
            // Create a file from the blob
            const fileName = selectedCloth.split('/').pop() || "saved_cloth.png";
            clothFile = new File([blob], fileName.split('?')[0], { type: blob.type });
        } catch (e) {
            console.error("Error fetching selected cloth:", e);
        }
    }

    if (!userImageFile || !clothFile) {
        return Swal.fire("❌ Error", "Please upload your base image. (Clothing is selected)", "error");
    }

    showLoader("1. Sending to AI Server (Colab)...");

    // 1. Prepare FormData
    const formData = new FormData();
    formData.append('person_image', userImageFile); // Note keys match Colab: person_image
    formData.append('garment_image', clothFile);    // Note keys match Colab: garment_image

    // Attach HF token if available in session
    const sessionToken = getSessionHFToken();
    if (sessionToken) {
        formData.append('hf_token', sessionToken);
    }

    try {
        if (!API_BASE_URL) throw new Error("Please enter Server URL first.");

        // 2. POST Request
        const response = await fetch(`${API_BASE_URL}/try_on`, {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();

        // 3. Check if server needs an HF token
        if (data.status === "error" && data.error_code === "hf_token_required") {
            hideLoader();
            showHFTokenModal(data.message);
            return; // Wait for user to enter token — modal will auto-retry
        }

        if (data.status === "success" && (data.image_url || data.image)) {
            // 4. Result captured!
            let imageUrl = data.image_url || data.image;

            // Final result display
            tryonResult.innerHTML = `<div style="position: relative;">
                <img id="ai-result-img" src="${imageUrl}" style="max-width: 100%; max-height: 400px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);" crossorigin="anonymous" />
            </div>`;

            // Add accessories back
            renderAccessoriesOnResult();

            hideLoader();
            Swal.fire("✅ Done!", "Virtual Try-On successful!", "success");
        } else {
            throw new Error(data.message || "Unknown error from server");
        }

    } catch (error) {
        hideLoader();
        Swal.fire("❌ Connection Error", `Could not reach AI Server.\n${error.message}`, "error");
        console.error("API Fetch Error:", error);
    }
};




// --- REST OF THE LOGIC (Same as before) ---
['shirt', 'tshirt', 'pant', 'jacket'].forEach(type => {
    document.querySelector(`#${type}-upload`).addEventListener("change", e => handleUpload(e, type));
});

window.triggerUpload = function (type) {
    document.getElementById(`${type}-upload`).click();
};

function handleUpload(event, type) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        selectedCloth = e.target.result;
        renderPreviewOverlay();
    };
    reader.readAsDataURL(file);
}

async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    const userInfoDiv = document.getElementById("user-info-nav"); // Updated Target ID

    if (user) {
        try {
            // Fetch user details from 'users' table
            const { data, error } = await supabase
                .from('users')
                .select('full_name')
                .eq('id', user.id)
                .single();

            if (data && userInfoDiv) {
                const fullName = data.full_name || user.email;
                // Just Show Name in Navbar with Logout
                userInfoDiv.innerHTML = `
                    <span style="font-weight:600; color:#ff4757;">Hi, ${fullName.split(' ')[0]}</span>
                    <button onclick="logout()" class="nav-btn">Logout</button>
                `;

                if (!sessionStorage.getItem("welcomed")) {
                    Swal.fire({ icon: 'success', title: `🎉 Welcome, ${fullName}!`, text: 'You have logged in successfully.' });
                    sessionStorage.setItem("welcomed", "true");
                }
            }
        } catch (err) {
            console.error("Error fetching user data:", err);
        }
    } else {
        window.location.href = "login.html";
    }
}

checkUser();

window.logout = async function () {
    await supabase.auth.signOut();
    sessionStorage.removeItem("welcomed");
    Swal.fire({ icon: 'info', title: 'Logged out', text: 'You have been logged out successfully.' }).then(() => {
        window.location.href = "login.html";
    });
};

userImageInput.addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        uploadedImage = e.target.result;
        previewImg.src = uploadedImage;
        previewImg.style.display = 'block';
        renderPreviewOverlay();
    };
    reader.readAsDataURL(file);
});

function handleAccessoryUpload(input, key) {
    input.addEventListener("change", function () {
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            accessories[key] = e.target.result;
            renderAccessoriesOnResult();
        };
        reader.readAsDataURL(file);
    });
}

handleAccessoryUpload(glassesInput, "glasses");
handleAccessoryUpload(watchInput, "watch");
handleAccessoryUpload(chainInput, "chain");
handleAccessoryUpload(earringInput, "earring");
handleAccessoryUpload(bagInput, "bag");
handleAccessoryUpload(shoesInput, "shoes");


function makeDraggable(el) {
    let isDragging = false, offsetX, offsetY;
    el.addEventListener("mousedown", (e) => {
        isDragging = true;
        offsetX = e.clientX - el.offsetLeft;
        offsetY = e.clientY - el.offsetTop;
        el.style.zIndex = 999;
    });
    document.addEventListener("mousemove", (e) => {
        if (isDragging) {
            el.style.left = (e.clientX - offsetX) + 'px';
            el.style.top = (e.clientY - offsetY) + 'px';
        }
    });
    document.addEventListener("mouseup", () => isDragging = false);
}

const isRemote = (url) => url && (url.startsWith('http') || url.startsWith('//'));

function renderPreviewOverlay() {
    if (!uploadedImage) return;

    // Check if base image is remote (unlikely for upload, but possible if changed later)
    const baseCrossOrigin = isRemote(uploadedImage) ? 'crossorigin="anonymous"' : '';

    let html = `<div style="position: relative; display: inline-block;">
        <img src="${uploadedImage}" style="max-width: 300px; border-radius: 10px;" ${baseCrossOrigin} />`;

    if (selectedCloth) {
        const clothCrossOrigin = isRemote(selectedCloth) ? 'crossorigin="anonymous"' : '';
        html += `<img src="${selectedCloth}" style="position: absolute; top: 0; left: 0; max-width: 300px; opacity: 0.85;" ${clothCrossOrigin} />`;
    }
    html += `</div>`;
    tryonResult.innerHTML = html;
    renderAccessoriesOnResult();
}

function renderAccessoriesOnResult() {
    const container = tryonResult.querySelector('div');
    if (!container) return;
    container.querySelectorAll('.accessory').forEach(el => el.remove());

    Object.entries(accessories).forEach(([key, src]) => {
        if (src) {
            const img = document.createElement('img');
            img.src = src;
            if (isRemote(src)) {
                img.crossOrigin = "anonymous";
            }
            img.className = 'accessory';
            img.style.position = 'absolute';
            img.style.top = '100px';
            img.style.left = '100px';
            img.style.maxWidth = '70px';
            img.style.opacity = 0.95;
            img.style.cursor = 'move';
            makeDraggable(img);
            container.appendChild(img);
        }
    });
}

window.saveAsImage = function () {
    const target = document.querySelector("#tryon-result > div");
    if (!target) return Swal.fire("❌", "Try on something first.", "error");

    html2canvas(target).then(canvas => {
        const link = document.createElement("a");
        link.download = "my-virtual-look.png";
        link.href = canvas.toDataURL();
        link.click();
    });
};

window.saveToWardrobe = async function () {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Swal.fire("Login required", "", "warning");

    const container = document.querySelector("#tryon-result > div");
    // Relaxed check: Just look for any image, not specifically the AI result
    const baseImg = container ? container.querySelector("img") : null;

    if (!container || !baseImg) return Swal.fire("❌", "Try on something (or upload a photo) first.", "info");

    // --- NEW: Metadata Prompt ---
    const { value: formValues } = await Swal.fire({
        title: 'Save to Wardrobe',
        html:
            '<select id="swal-style" class="swal2-input">' +
            '<option value="" disabled selected>Select Style Combo</option>' +
            '<option value="Casual">Casual</option>' +
            '<option value="Formal">Formal</option>' +
            '<option value="Streetwear">Streetwear</option>' +
            '<option value="Party">Party</option>' +
            '<option value="Other">Other</option>' +
            '</select>' +
            '<input id="swal-accessory" class="swal2-input" placeholder="Accessory Name (Optional)">',
        focusConfirm: false,
        showCancelButton: true,
        preConfirm: () => {
            return [
                document.getElementById('swal-style').value,
                document.getElementById('swal-accessory').value
            ]
        }
    });

    if (!formValues) return; // User cancelled

    const [styleName, accessoryName] = formValues;
    if (!styleName) return Swal.fire("Style Required", "Please select a style category.", "warning");

    showLoader("Saving outfit...");
    // Call internal save with metadata
    await _internalSaveToWardrobe(user, container, baseImg, styleName, accessoryName);
};

// Internal function to handle the actual saving logic (refactored from original saveToWardrobe)
async function _internalSaveToWardrobe(user, container, baseImg, styleName, accessoryName) {
    try {
        // 1. Upload Cloth Image (if base64)
        let clothUrl = selectedCloth;
        // Check if selectedCloth is base64
        if (selectedCloth && selectedCloth.startsWith("data:")) {
            const clothFileName = `${user.id}/cloths/${Date.now()}.png`;
            // Convert base64 to blob? Or just upload? Supabase storage upload needs Blob/File/ArrayBuffer
            // Let's fetch it to get a blob
            const clothRes = await fetch(selectedCloth);
            const clothBlob = await clothRes.blob();

            const { data: clothUpload, error: clothErr } = await supabase.storage
                .from('wardrobe_images')
                .upload(clothFileName, clothBlob);

            if (clothErr) throw clothErr;

            const { data: { publicUrl } } = supabase.storage.from('wardrobe_images').getPublicUrl(clothFileName);
            clothUrl = publicUrl;
        }

        // 2. Manual Canvas Composition
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        // Use the displayed dimensions of the base image
        const w = baseImg.clientWidth;
        const h = baseImg.clientHeight;
        canvas.width = w;
        canvas.height = h;

        // Draw ALL core images (Base Person + Cloth Overlay if exists)
        // Exclude accessories for now, we draw them later
        const coreImages = container.querySelectorAll('img:not(.accessory)');
        coreImages.forEach(img => {
            // Draw if visible
            if (img.style.display !== 'none') {
                // If it's absolute, use its position, otherwise 0,0
                const x = img.style.position === 'absolute' ? img.offsetLeft : 0;
                const y = img.style.position === 'absolute' ? img.offsetTop : 0;
                ctx.drawImage(img, x, y, img.clientWidth, img.clientHeight);
            }
        });

        // Draw Accessories
        const accessoriesEls = container.querySelectorAll('.accessory');
        accessoriesEls.forEach(acc => {
            ctx.drawImage(acc, acc.offsetLeft, acc.offsetTop, acc.clientWidth, acc.clientHeight);
        });

        // Convert to Blob
        await new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if (!blob) {
                    reject(new Error("Canvas compilation failed"));
                    return;
                }

                (async () => {
                    try {
                        const fileName = `${user.id}/wardrobe/outfit_${Date.now()}.png`;

                        const { data: uploadData, error: uploadError } = await supabase.storage
                            .from('wardrobe_images')
                            .upload(fileName, blob);

                        if (uploadError) throw uploadError;

                        const { data: { publicUrl } } = supabase.storage
                            .from('wardrobe_images')
                            .getPublicUrl(fileName);

                        // 3. Save Metadata to Supabase DB
                        const { error: dbError } = await supabase
                            .from('wardrobe')
                            .insert([{
                                user_id: user.id,
                                image_url: publicUrl,
                                cloth_url: clothUrl,
                                style: styleName, // Saved from user input
                                accessories: accessoryName ? { [accessoryName]: true, ...accessories } : accessories,
                                created_at: new Date()
                            }]);

                        if (dbError) throw dbError;

                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                })();
            }, 'image/png');
        });

        hideLoader();
        Swal.fire("✅ Saved!", "Outfit saved to your wardrobe database.", "success");

    } catch (error) {
        hideLoader();
        console.error("Saving error:", error);
        // alert(`Saving Failed: ${error.message}`);
        Swal.fire("❌ Error", `Could not save to database: ${error.message}`, "error");
    }
};

window.generateRecommendation = async function () {
    if (!API_BASE_URL) return Swal.fire("Setup Required", "Please paste your Server URL in the sidebar.", "info");

    showLoader("AI is styling you...");

    try {
        // Determine clothing type from whichever upload was used
        let clothingType = null;
        for (const type of ['shirt', 'tshirt', 'pant', 'jacket']) {
            if (document.getElementById(`${type}-upload`).files.length > 0) {
                clothingType = type;
                break;
            }
        }

        const body = {
            clothing_type: clothingType,
            occasion: currentStyle || null,
            image_data: uploadedImage // Send user/outfit base64 image used in preview
        };

        const response = await fetch(`${API_BASE_URL}/recommend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const data = await response.json();
        hideLoader();

        if (data.status === 'success' && data.suggestion) {
            document.getElementById("rec-text").textContent = data.suggestion;
            document.getElementById("recommendation").style.display = "block";
        } else {
            throw new Error(data.message || "No suggestion returned");
        }
    } catch (error) {
        hideLoader();
        // Fallback to basic suggestion if backend fails
        document.getElementById("rec-text").textContent = "AI Suggests: White sneakers, a brown leather watch, and a minimal chain create a versatile look.";
        document.getElementById("recommendation").style.display = "block";
        console.error("Recommendation error:", error);
    }
};

window.applyCombo = async function (style) {
    if (!uploadedImage) return Swal.fire("Upload photo first!", "", "info");

    currentStyle = style;

    // Try to fetch combo from backend (includes AI tip), fallback to local
    if (API_BASE_URL) {
        try {
            const response = await fetch(`${API_BASE_URL}/combos/${style}`);
            const data = await response.json();

            if (data.status === 'success') {
                selectedCloth = data.clothing;
                accessories.glasses = data.accessories.glasses;
                accessories.watch = data.accessories.watch;
                accessories.chain = data.accessories.chain;
                accessories.earring = data.accessories.earring;
                accessories.bag = data.accessories.bag;
                accessories.shoes = data.accessories.shoes;

                renderPreviewOverlay();
                document.getElementById("recommendation").style.display = "none";

                // Show AI tip if available
                if (data.ai_tip) {
                    document.getElementById("rec-text").textContent = `💡 ${data.ai_tip}`;
                    document.getElementById("recommendation").style.display = "block";
                }
                return;
            }
        } catch (e) {
            console.warn("Backend combo fetch failed, using local fallback:", e);
        }
    }

    // Local fallback (same as original behavior)
    selectedCloth = `images/combos/${style}_${style === 'party' ? 'jacket' : 'shirt'}.png`;
    accessories.glasses = style === 'casual' ? `images/combos/${style}_glasses.png` : null;
    accessories.watch = style === 'formal' ? `images/combos/${style}_watch.png` : null;
    accessories.chain = (style === 'formal' || style === 'party') ? `images/combos/${style}_chain.png` : null;
    accessories.earring = style === 'party' ? `images/combos/${style}_earring.png` : null;
    accessories.bag = null;
    accessories.shoes = `images/combos/${style}_shoes.png`;

    renderPreviewOverlay();
    document.getElementById("recommendation").style.display = "none";
};

let webcamStream = null;
window.startWebcam = function () {
    const video = document.getElementById("webcam");
    const captureBtn = document.getElementById("capture-btn");

    navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
        webcamStream = stream;
        video.srcObject = stream;
        video.style.display = "block";
        captureBtn.style.display = "inline-block";
    }).catch((err) => {
        Swal.fire("Camera Error", "Camera access denied or unavailable.", "error");
        console.error(err);
    });
};

window.capturePhoto = function () {
    const video = document.getElementById("webcam");
    const canvas = document.getElementById("webcam-canvas");
    const preview = document.getElementById("preview");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataURL = canvas.toDataURL("image/png");
    uploadedImage = dataURL;
    preview.src = uploadedImage;
    preview.style.display = "block";

    video.style.display = "none";
    document.getElementById("capture-btn").style.display = "none";

    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
    }

    renderPreviewOverlay();
};

window.goToWardrobe = function () {
    window.location.href = "wardrobe.html";
};

// Check for Retry Outfit from Wardrobe
window.addEventListener("DOMContentLoaded", () => {
    const retryData = localStorage.getItem("retryOutfit");
    if (retryData) {
        try {
            const data = JSON.parse(retryData);
            console.log("Retrying outfit:", data);

            // Restore style
            if (data.style) currentStyle = data.style;

            // Restore Cloth
            if (data.cloth) {
                selectedCloth = data.cloth;
            }

            // Restore Accessories
            if (data.accessories) {
                Object.assign(accessories, data.accessories);
            }

            // Clean up
            localStorage.removeItem("retryOutfit");

            // Render (This will only show if user uploads a person image, 
            // but the state is set so it will appear instantly upon upload)
            // If they already have an image (unused feature currently), it would show.
            // We can alert them.
            Swal.fire({
                title: 'Outfit Loaded!',
                text: 'Please upload your photo to try on this saved outfit.',
                icon: 'success',
                timer: 3000
            });

        } catch (e) {
            console.error("Error parsing retry data:", e);
        }
    }
});


// =================================================================
// === HF TOKEN MODAL CONTROLLER ===
// =================================================================

function showHFTokenModal(errorMessage) {
    const overlay = document.getElementById('hf-modal-overlay');
    const errorDiv = document.getElementById('hf-modal-error');
    const input = document.getElementById('hf-token-input');

    // Show error message from server
    if (errorMessage) {
        errorDiv.textContent = errorMessage;
        errorDiv.style.display = 'block';
    } else {
        errorDiv.style.display = 'none';
    }

    // Pre-fill if session has a token (user might be re-entering)
    const existing = getSessionHFToken();
    if (existing) input.value = existing;

    overlay.style.display = 'flex';
    input.focus();
}

function hideHFTokenModal() {
    document.getElementById('hf-modal-overlay').style.display = 'none';
    document.getElementById('hf-token-input').value = '';
    document.getElementById('hf-modal-error').style.display = 'none';
}

// Submit button
document.getElementById('hf-token-submit')?.addEventListener('click', () => {
    const input = document.getElementById('hf-token-input');
    const errorDiv = document.getElementById('hf-modal-error');
    const token = input.value.trim();

    // Validate format: must start with hf_ and be reasonable length
    if (!token) {
        errorDiv.textContent = 'Please enter a token.';
        errorDiv.style.display = 'block';
        return;
    }
    if (!token.startsWith('hf_') || token.length < 10) {
        errorDiv.textContent = 'Invalid format. Token must start with "hf_" and be at least 10 characters.';
        errorDiv.style.display = 'block';
        return;
    }

    // Store in session and retry
    setSessionHFToken(token);
    hideHFTokenModal();

    Swal.fire({
        title: 'Token saved!',
        text: 'Retrying your try-on request...',
        icon: 'info',
        timer: 1500,
        showConfirmButton: false,
    });

    // Auto-retry the try-on
    setTimeout(() => {
        window.triggerApiTryon();
    }, 800);
});

// Cancel button
document.getElementById('hf-token-cancel')?.addEventListener('click', hideHFTokenModal);

// Toggle password visibility
document.getElementById('hf-token-toggle')?.addEventListener('click', () => {
    const input = document.getElementById('hf-token-input');
    input.type = input.type === 'password' ? 'text' : 'password';
});

// Allow Enter key to submit
document.getElementById('hf-token-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('hf-token-submit').click();
    }
});
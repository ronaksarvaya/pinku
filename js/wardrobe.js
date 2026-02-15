import { supabase } from "./supabase-config.js";

const wardrobeList = document.getElementById("wardrobe-list");
const userInfo = document.getElementById("user-info");

let allOutfits = [];

async function checkUserAndLoadWardrobe() {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    alert("Please log in.");
    window.location.href = "login.html";
    return;
  }

  const userInfoDiv = document.getElementById("user-info-nav");

  if (userInfoDiv && user) {
    const fullName = user.user_metadata?.full_name || user.email;
    userInfoDiv.innerHTML = `
        <span style="font-weight:600; color:#ff4757;">Hi, ${fullName.split(' ')[0]}</span>
        <button onclick="logout()" class="nav-btn">Logout</button>
     `;
  }
  // userInfo.innerHTML = `Logged in as <strong>${user.email}</strong><br><br>`;

  try {
    const { data, error } = await supabase
      .from('wardrobe')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    allOutfits = data.map(item => ({
      id: item.id,
      imageUrl: item.image_url,
      cloth: item.cloth_url, // Assuming we saved it or it's null
      accessories: item.accessories || {}, // Handle missing accessories if not saved
      style: item.style || 'Unknown',
      timestamp: item.created_at
    }));

    if (allOutfits.length === 0) {
      wardrobeList.innerHTML = "<p>No outfits saved yet.</p>";
    } else {
      renderWardrobe(allOutfits);
    }
  } catch (e) {
    console.error("Error loading wardrobe:", e);
    wardrobeList.innerHTML = "<p>Error loading your wardrobe.</p>";
  }
}

checkUserAndLoadWardrobe();

// Listen for auth changes
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    window.location.href = "login.html";
  }
});

// Helpers
function formatDate(dateString) {
  return new Date(dateString).toLocaleString();
}

// Update time display in render
// Update time display in render
function renderWardrobe(outfits) {
  wardrobeList.innerHTML = "";

  outfits.forEach(data => {
    const item = document.createElement("div");
    item.className = "outfit-card";

    const time = formatDate(data.timestamp);

    item.innerHTML = `
      <div class="outfit-meta">
          <p><strong>Style:</strong> ${data.style}</p>
          <p><strong>Date:</strong> ${time}</p>
      </div>
      
      <p style="margin-top:10px; color:#ff4757; font-weight:600; text-transform:uppercase; font-size:12px;">Final Look</p>
      <img src="${data.imageUrl}" crossorigin="anonymous" style="border:1px solid #57606f;" />
      
      <p style="margin-top:10px; color:#a4b0be; font-size:12px;">Attire Used</p>
      ${data.cloth ? `<img src="${data.cloth}" style="max-height: 80px;" crossorigin="anonymous" />` : '<span style="color:#555;">N/A</span>'}
      
      <div style="margin-top:15px; display: flex; gap: 10px; justify-content: center;">
          <button onclick='retryOutfit(${JSON.stringify(data).replace(/'/g, "\\'")})' style="background:#2f3542; color:#fff; border:1px solid #57606f; padding:6px 12px; border-radius:4px;">🔄 Re-Try</button>
          <button onclick='deleteOutfit("${data.id}")' style="background: #ff4757; color: white; border:none; padding:6px 12px; border-radius:4px;">🗑 Delete</button>
      </div>
    `;

    wardrobeList.appendChild(item);
  });
}

window.retryOutfit = function (data) {
  // Map back to what tryon expects
  const retryData = {
    style: data.style,
    cloth: data.cloth,
    accessories: data.accessories
  };
  localStorage.setItem("retryOutfit", JSON.stringify(retryData));
  window.location.href = "tryon.html";
};

window.deleteOutfit = async function (docId) {
  if (!confirm("Are you sure you want to delete this outfit?")) return;

  try {
    const { error } = await supabase
      .from('wardrobe')
      .delete()
      .eq('id', docId);

    if (error) throw error;

    alert("Outfit deleted.");
    location.reload();
  } catch (e) {
    console.error("Delete failed:", e);
    alert("Failed to delete outfit.");
  }
};

// Logout function
window.logout = async function () {
  await supabase.auth.signOut();
  window.location.href = "login.html";
};

// Filters
window.applyFilters = function () {
  const styleFilter = document.getElementById("style-filter").value;
  const accFilter = document.getElementById("accessory-filter").value;

  const filtered = allOutfits.filter(outfit => {
    const matchesStyle = styleFilter ? outfit.style === styleFilter : true;
    const matchesAccessory = accFilter ? outfit.accessories[accFilter] : true;
    return matchesStyle && matchesAccessory;
  });

  renderWardrobe(filtered);
};

window.resetFilters = function () {
  document.getElementById("style-filter").value = "";
  document.getElementById("accessory-filter").value = "";
  renderWardrobe(allOutfits);
};

import { supabase } from "./supabase-config.js";

function showLoader(message) {
  const loadingText = document.querySelector('.loading-text');
  if (loadingText) loadingText.textContent = message;
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) loadingOverlay.style.display = 'flex';
}

function hideLoader() {
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) loadingOverlay.style.display = 'none';
}

const signupForm = document.getElementById("signup-form");
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const fullName = document.getElementById("fullname").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  showLoader("Creating your account...");

  try {
    // 1. Sign up user
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          full_name: fullName,
        }
      }
    });

    if (error) throw error;

    const user = data.user;

    if (user) {
      // 2. Insert into users table
      const { error: dbError } = await supabase
        .from('users')
        .insert([
          {
            id: user.id,
            email: email,
            full_name: fullName,
            created_at: new Date()
          }
        ]);

      if (dbError) {
        // If DB insert fails, we might want to warn, but auth succeeded.
        console.error("Error creating user profile:", dbError);
      }

      hideLoader();
      Swal.fire({
        icon: 'success',
        title: 'Signup Successful!',
        text: '🎉 Welcome to Virtual Try-On! ',
        confirmButtonText: 'Go to Try-On',
        confirmButtonColor: '#007bff'
      }).then(() => {
        window.location.href = 'tryon.html';
      });
    }

  } catch (error) {
    hideLoader();
    Swal.fire({
      icon: 'error',
      title: 'Oops! Signup Failed',
      text: error.message,
      confirmButtonColor: '#d33'
    });
  }
});

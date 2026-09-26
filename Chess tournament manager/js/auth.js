// =====================================================
// CHESS TOURNAMENT MANAGER
// AUTHENTICATION
// =====================================================

document.addEventListener("DOMContentLoaded", function () {

    const loginForm = document.getElementById("loginForm");

    if (loginForm) {
        loginForm.addEventListener("submit", handleLogin);
    }

    const registerForm = document.getElementById("registerForm");

    if (registerForm) {
        registerForm.addEventListener("submit", handleRegister);
    }

});


// =====================================================
// LOGIN
// =====================================================

async function handleLogin(event) {

    event.preventDefault();

    const emailInput = document.getElementById("loginEmail");
    const passwordInput = document.getElementById("loginPassword");
    const message = document.getElementById("loginMessage");
    const button = document.getElementById("loginButton");

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    message.textContent = "";
    message.className = "auth-message";

    if (!email || !password) {
        message.textContent = "Please enter your email and password.";
        message.className = "auth-message error";
        return;
    }

    if (
        typeof supabaseClient === "undefined" ||
        !supabaseClient ||
        !supabaseClient.auth
    ) {
        message.textContent =
            "Supabase connection is not available.";

        message.className = "auth-message error";

        console.error("supabaseClient is undefined.");

        return;
    }

    button.disabled = true;
    button.textContent = "Logging in...";

    try {

        const result =
            await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });

        const data = result.data;
        const error = result.error;

        if (error) {
            throw error;
        }

        if (!data || !data.session) {
            throw new Error(
                "Login succeeded but no session was created."
            );
        }

        message.textContent =
            "Login successful. Redirecting...";

        message.className =
            "auth-message success";

        window.location.href =
            "./dashboard.html";

    } catch (error) {

        console.error("LOGIN ERROR:", error);

        message.textContent =
            getAuthErrorMessage(error);

        message.className =
            "auth-message error";

        button.disabled = false;
        button.textContent = "Login";
    }
}


// =====================================================
// REGISTER
// =====================================================

async function handleRegister(event) {

    event.preventDefault();

    const emailInput =
        document.getElementById("registerEmail");

    const passwordInput =
        document.getElementById("registerPassword");

    const confirmInput =
        document.getElementById("confirmPassword");

    const message =
        document.getElementById("registerMessage");

    const button =
        document.querySelector(
            "#registerForm button[type='submit']"
        );

    const email =
        emailInput.value.trim();

    const password =
        passwordInput.value;

    const confirmPassword =
        confirmInput.value;

    message.textContent = "";
    message.className = "auth-message";

    if (!email) {

        message.textContent =
            "Please enter your email.";

        message.className =
            "auth-message error";

        return;
    }

    if (password.length < 6) {

        message.textContent =
            "Password must contain at least 6 characters.";

        message.className =
            "auth-message error";

        return;
    }

    if (password !== confirmPassword) {

        message.textContent =
            "Passwords do not match.";

        message.className =
            "auth-message error";

        return;
    }

    if (
        typeof supabaseClient === "undefined" ||
        !supabaseClient ||
        !supabaseClient.auth
    ) {

        message.textContent =
            "Supabase connection is not available.";

        message.className =
            "auth-message error";

        return;
    }

    button.disabled = true;
    button.textContent = "Creating account...";

    try {

        const result =
            await supabaseClient.auth.signUp({
                email: email,
                password: password,

                // After email confirmation,
                // return the user to the Login page.
                options: {
                    emailRedirectTo:
                        "http://localhost:3000/pages/login.html"
                }
            });

        const data = result.data;
        const error = result.error;

        if (error) {
            throw error;
        }

        if (data && data.session) {

            message.textContent =
                "Account created. Redirecting...";

            message.className =
                "auth-message success";

            window.location.href =
                "./dashboard.html";

            return;
        }

        message.textContent =
            "Account created. Please confirm your email, then log in.";

        message.className =
            "auth-message success";

        button.disabled = false;
        button.textContent = "Create Account";

    } catch (error) {

        console.error("REGISTER ERROR:", error);

        message.textContent =
            getAuthErrorMessage(error);

        message.className =
            "auth-message error";

        button.disabled = false;
        button.textContent =
            "Create Account";
    }
}


// =====================================================
// ERROR MESSAGES
// =====================================================

function getAuthErrorMessage(error) {

    if (!error) {
        return "Authentication failed.";
    }

    const message =
        String(error.message || "").toLowerCase();

    if (
        message.includes("invalid login credentials") ||
        message.includes("invalid credentials")
    ) {
        return "Incorrect email or password.";
    }

    if (message.includes("email not confirmed")) {
        return "Your email has not been confirmed.";
    }

    if (
        message.includes("user already registered") ||
        message.includes("already registered")
    ) {
        return "An account with this email already exists.";
    }

    if (
        message.includes("password should be at least") ||
        message.includes("password must be at least")
    ) {
        return "Password must contain at least 6 characters.";
    }

    if (
        message.includes("unable to validate email") ||
        (
            message.includes("email address") &&
            message.includes("invalid")
        )
    ) {
        return "Please enter a valid email address.";
    }

    if (
        message.includes("failed to fetch") ||
        message.includes("network") ||
        message.includes("fetch")
    ) {
        return "Connection error. Please check your internet connection.";
    }

    return error.message ||
        "Authentication failed. Please try again.";
}
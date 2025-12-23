// Auth Functions
const API_URL = '';

// Check if user is logged in
function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token && !window.location.pathname.includes('login')) {
        window.location.href = '/login.html';
    }
}

// Login form handler
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');

    if (loginForm) {
        // Check if already logged in
        const token = localStorage.getItem('token');
        if (token) {
            window.location.href = '/index.html';
            return;
        }

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('loginError');
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            const btnText = submitBtn.querySelector('span:first-child');
            const btnLoading = submitBtn.querySelector('.btn-loading');

            // Show loading
            btnText.classList.add('hidden');
            btnLoading.classList.remove('hidden');
            submitBtn.disabled = true;
            errorDiv.classList.add('hidden');

            try {
                const response = await fetch(`${API_URL}/api/auth/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Erro ao fazer login');
                }

                // Save token and user info
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));

                // Redirect to dashboard
                window.location.href = '/index.html';
            } catch (error) {
                errorDiv.textContent = error.message;
                errorDiv.classList.remove('hidden');
            } finally {
                btnText.classList.remove('hidden');
                btnLoading.classList.add('hidden');
                submitBtn.disabled = false;
            }
        });
    }
});

// Export functions
window.checkAuth = checkAuth;

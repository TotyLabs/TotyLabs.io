document.addEventListener('DOMContentLoaded', () => {
    // Scroll Reveal Optimization
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.05 });

    const revealItems = document.querySelectorAll('section, h1, .diagram-node, .model-item, .mention-card');
    revealItems.forEach(item => {
        item.style.opacity = '0';
        item.style.transform = 'translateY(15px)';
        item.style.transition = 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
        revealObserver.observe(item);
    });

    // Helper for Reveal animation
    const style = document.createElement('style');
    style.innerHTML = `
        .revealed {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
    `;
    document.head.appendChild(style);

    // Form Handling: open the user's mail client with a prefilled message
    const enterpriseForm = document.getElementById('enterprise-form');
    const statusEl = document.getElementById('form-status');

    if (enterpriseForm) {
        enterpriseForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const honeypot = document.getElementById('honeypot');
            if (honeypot && honeypot.value) {
                console.warn('Spam detected');
                return;
            }

            const btn = enterpriseForm.querySelector('button');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<span class="mono">Opening Gmail...</span>';
            btn.disabled = true;
            statusEl.innerHTML = '';
            statusEl.style.color = 'var(--text-secondary)';

            const formData = new FormData(enterpriseForm);
            const data = Object.fromEntries(formData.entries());

            const recipient = 'contact.totylabs@gmail.com';
            const subject = `TotyLabs Inquiry: ${data.company ? data.company + ' - ' : ''}${data.name}`;
            const body = `Name: ${data.name}\nEmail: ${data.email}\nCompany: ${data.company || 'N/A'}\n\nMessage:\n${data.message}`;

            const gmailLink = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipient)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            window.open(gmailLink, '_blank', 'noopener,noreferrer');

            setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = originalText;
                statusEl.innerHTML = 'Se abrió tu cliente de correo. Solo debes presionar Enviar.';
                statusEl.style.color = '#16F2C4';
            }, 800);
        });
    }
});

// Theme toggle logic (keeps separate so it's easy to locate)
(() => {
    const THEMES = ['dark', 'light', 'bw'];
    const storageKey = 'site-theme';

    function applyTheme(theme) {
        document.documentElement.classList.remove('theme-light', 'theme-bw');
        if (theme === 'light') document.documentElement.classList.add('theme-light');
        if (theme === 'bw') document.documentElement.classList.add('theme-bw');
        // update button label/icon if present
        const btn = document.getElementById('theme-toggle');
        if (btn) {
            btn.innerText = theme === 'dark' ? 'Tema: Negro' : theme === 'light' ? 'Tema: Blanco' : 'Tema: B/N';
        }
    }

    function currentTheme() {
        return localStorage.getItem(storageKey) || 'dark';
    }

    function cycleTheme() {
        const cur = currentTheme();
        const idx = THEMES.indexOf(cur);
        const next = THEMES[(idx + 1) % THEMES.length];
        localStorage.setItem(storageKey, next);
        applyTheme(next);
    }

    // Initialize theme on load
    try {
        applyTheme(currentTheme());
    } catch (e) {
        console.error('Theme init error', e);
    }

    // Attach to button
    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('theme-toggle');
        if (btn) btn.addEventListener('click', cycleTheme);
    });
})();

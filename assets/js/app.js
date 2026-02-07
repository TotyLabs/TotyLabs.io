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

    // Form Handling (Preserving EmailJS Placeholder Logic)
    const enterpriseForm = document.getElementById('enterprise-form');
    const statusEl = document.getElementById('form-status');

    if (enterpriseForm) {
        enterpriseForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const btn = enterpriseForm.querySelector('button');
            const originalText = btn.innerHTML;

            btn.innerHTML = '<span class="mono">Connecting...</span>';
            btn.disabled = true;

            // Simulating high-authority technical connection
            setTimeout(() => {
                statusEl.innerHTML = '[CLOSED] CONNECTION ESTABLISHED. OUR INFRASTRUCTURE TEAM WILL RESPOND.';
                statusEl.style.color = '#16F2C4';
                btn.innerHTML = '<span class="mono">ESTABLISHED</span>';
                enterpriseForm.reset();
            }, 1000);
        });
    }
});

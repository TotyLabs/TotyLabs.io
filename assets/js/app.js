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

            // Honeypot anti-spam
            const honeypot = document.getElementById('honeypot');
            if (honeypot && honeypot.value) {
                console.warn('Spam detected');
                return;
            }

            const btn = enterpriseForm.querySelector('button');
            const originalText = btn.innerHTML;

            btn.innerHTML = '<span class="mono">Establishing Uplink...</span>';
            btn.disabled = true;
            statusEl.innerHTML = '';
            statusEl.style.color = 'var(--text-secondary)';

            // Real POST request to backend
            const formData = new FormData(enterpriseForm);
            const data = Object.fromEntries(formData.entries());

            fetch('http://localhost:3000/api/contact', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            })
                .then(response => response.json())
                .then(result => {
                    if (result.success) {
                        statusEl.innerHTML = '[CLOSED] UPLINK ESTABLISHED. TRANSMISSION COMPLETE.';
                        statusEl.style.color = '#16F2C4'; // Success Teal
                        btn.innerHTML = '<span class="mono">TRANSMISSION CONFIRMED</span>';
                        enterpriseForm.reset();
                    } else {
                        throw new Error(result.error || 'Transmission failed');
                    }
                })
                .catch(error => {
                    console.error('Uplink error:', error);
                    statusEl.innerHTML = '[ERROR] UPLINK FAILED. RETRY TRANSMISSION.';
                    statusEl.style.color = '#ff4d4d'; // Error Red
                    btn.innerHTML = '<span class="mono">RETRY CONNECTION</span>';
                })
                .finally(() => {
                    // Reset button after delay
                    setTimeout(() => {
                        btn.disabled = false;
                        btn.innerHTML = originalText;
                        if (statusEl.innerHTML.includes('ERROR')) {
                            // Keep error visible
                        } else {
                            statusEl.innerHTML = '';
                        }
                    }, 5000);
                });
        });
    }
});

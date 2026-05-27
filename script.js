document.addEventListener('DOMContentLoaded', () => {
    // Dismiss Global Loader
    const loader = document.getElementById('app-loader');
    // If the inline script in index.html already hid the loader, skip the delay
    if (loader && loader.style.display !== 'none') {
        // Only show the premium intro once per session to keep navigation fast
        const hasSeenIntro = sessionStorage.getItem('eateria_intro_played');

        if (hasSeenIntro) {
            // Instant transition for returning users
            loader.style.display = 'none';
            loader.remove();
            document.body.classList.remove('loading');
        } else {
            // Cinematic hold for the first visit
            setTimeout(() => {
                loader.style.opacity = '0';
                setTimeout(() => loader.remove(), 600);
                document.body.classList.remove('loading');
                sessionStorage.setItem('eateria_intro_played', 'true');
            }, 1200); // Matches the peak of the CSS animation
        }
    }

    const checkIsMobile = () => window.matchMedia('(max-width: 768px)').matches;

    /* ==========================================================================
       0. Pre-declare DOM elements to avoid Temporal Dead Zone issues
       ========================================================================== */
    const navbar = document.querySelector('.navbar');
    const cartDrawer = document.getElementById('cart-drawer');
    const cartOverlay = document.getElementById('cart-overlay');
    const detailModal = document.getElementById('detail-modal');
    const paymentModal = document.getElementById('payment-modal');
    const trackerModal = document.getElementById('tracker-modal');
    const body = document.body;

    /* ==========================================================================
       0.1 Scroll Restoration Policy
       ========================================================================== */
    // Prevent browser from jumping to top before our manual restoration kicks in
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    // Rule 3: Flexible API URL (Development vs Production)
    const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? "http://localhost:5000" 
        : "https://eateria-backend.onrender.com";

    /* ==========================================================================
       UTILITIES: Custom Toast Notification System & Debounce
       (Moved to top to prevent Temporal Dead Zone issues)
       ========================================================================== */
    const toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    body.appendChild(toastContainer);

    const showToast = (message, type = 'success') => {
        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        
        // Ensure only one toast shows at a time or they stack nicely
        if (toastContainer.children.length > 2) {
            toastContainer.removeChild(toastContainer.firstChild);
        }

        const icon = document.createElement('span');
        icon.className = 'toast-icon';
        icon.textContent = type === 'success' ? '✓' : 'ℹ';

        const msgSpan = document.createElement('span');
        msgSpan.className = 'toast-message';
        msgSpan.textContent = message; 

        toast.appendChild(icon);
        toast.appendChild(msgSpan);
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    };

    const debounce = (fn, delay = 150) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => fn(...args), delay);
        };
    };

    // Fetch live order data
    async function getOrderStatus() {
        try {
            const response = await fetch(`${API_URL}/api/order`);
            const order = await response.json();

            // UPDATE UI components
            const arrivalElements = document.querySelectorAll(".arrival-time");
            arrivalElements.forEach(el => el.innerText = order.eta);
        } catch (error) {
            console.error("Order Status Fetch Error:", error);
        }
    }

    // Initialize Real-time Tracking Socket
    // Move backend connectivity to happen after the UI has settled
    window.addEventListener('load', () => {
        getOrderStatus();
        const socket = typeof io !== 'undefined' ? io(API_URL) : null;
        if (socket) {
            socket.on('orderUpdate', (data) => {
                showToast(`Order Status: ${data.status}`);
            });
        }
    });

    /* ==========================================================================
       1. Mobile Navigation Menu Toggle
       ========================================================================== */
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const navMenu = document.getElementById('nav-menu');
    const navLinks = document.querySelectorAll('.nav-link');

    if (mobileMenuToggle && navMenu) {
        mobileMenuToggle.addEventListener('click', () => {
            if (!navMenu.classList.contains('open')) {
                openModal(navMenu);
            } else {
                closeModal(navMenu);
            }
            mobileMenuToggle.setAttribute('aria-expanded', navMenu.classList.contains('open'));
        });

        // Close menu when a link is clicked
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                closeModal(navMenu);
                mobileMenuToggle.setAttribute('aria-expanded', 'false');
            });
        });
    }

    /* ==========================================================================
       Hero Section CTA Handlers (Smooth Scroll Fallback)
       ========================================================================== */
    const heroActions = document.querySelector('.hero-actions');
    if (heroActions) {
        heroActions.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (!link) return;
            
            const targetId = link.getAttribute('href');
            if (targetId && targetId.startsWith('#')) {
                e.preventDefault();
                const targetSection = document.querySelector(targetId);
                if (targetSection) {
                    targetSection.scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
    }

    /* ==========================================================================
       2. Sticky Navigation Header Scroll Effect (Optimized with RAF)
       ========================================================================== */
    let ticking = false;

    const updateBodyScrollLock = () => {
        // Lock background scroll for Tracking, Cart, Payment, and Mobile Menu
        const isTrackerOpen = trackerModal?.classList.contains('open');
        const isPaymentOpen = paymentModal?.classList.contains('open');
        const isCartOpen = cartDrawer?.classList.contains('open');
        const isMenuOpen = navMenu?.classList.contains('open');
        const isLocked = isTrackerOpen || isPaymentOpen || isCartOpen || isMenuOpen;
        
        document.documentElement.classList.toggle('no-scroll', isLocked);
        body.classList.toggle('no-scroll', isLocked);
    };

    let activeFocusTrapCleanup = null;
    const trapFocusWithin = (container) => {
        const focusableSelectors = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        const focusableElements = Array.from(container.querySelectorAll(focusableSelectors))
            .filter(el => el.offsetParent !== null);

        if (!focusableElements.length) {
            return () => {};
        }

        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        const handleKeydown = (event) => {
            if (event.key !== 'Tab') return;
            if (event.shiftKey) {
                if (document.activeElement === firstFocusable) {
                    event.preventDefault();
                    lastFocusable.focus();
                }
            } else if (document.activeElement === lastFocusable) {
                event.preventDefault();
                firstFocusable.focus();
            }
        };

        container.addEventListener('keydown', handleKeydown);
        return () => container.removeEventListener('keydown', handleKeydown);
    };

    const activateFocusTrap = (container) => {
        if (activeFocusTrapCleanup) {
            activeFocusTrapCleanup();
        }
        if (container) {
            const firstFocusable = container.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (firstFocusable) {
                firstFocusable.focus();
            }
            activeFocusTrapCleanup = trapFocusWithin(container);
        }
    };

    const deactivateFocusTrap = () => {
        if (activeFocusTrapCleanup) {
            activeFocusTrapCleanup();
            activeFocusTrapCleanup = null;
        }
    };

    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                if (navbar && window.scrollY > 20) {
                    navbar.classList.add('scrolled');
                } else {
                    navbar.classList.remove('scrolled');
                }
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });

    /* ==========================================================================
       3. Intersection Observer for Active Link Highlights
       ========================================================================== */
    const sections = document.querySelectorAll('section, footer');
    
    const observerOptions = {
        root: null,
        rootMargin: '-20% 0px -60% 0px', // Trigger when section occupies sweet spot
        threshold: 0
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const sectionId = entry.target.getAttribute('id');
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${sectionId}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }, observerOptions);

    sections.forEach(section => {
        observer.observe(section);
    });

    /* ==========================================================================
       3.1 Scroll Animation: Reveal Fade-in Sections
       ========================================================================== */
    const scrollRevealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                scrollRevealObserver.unobserve(entry.target); // Only animate once
            }
        });
    }, { threshold: 0.05, rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('.fade-section').forEach(section => {
        scrollRevealObserver.observe(section);
    });

    // Optimized video source management
    const updateHeroVideoSource = () => {
        const heroVideo = document.getElementById('hero-video');
        if (!heroVideo) return;

        const isMobile = checkIsMobile();
        const isPortrait = window.matchMedia('(orientation: portrait)').matches;

        // If on mobile but in landscape, portrait video (7890.mp4) shows black borders.
        // We shift to the PC video (123456.mp4) in landscape to ensure a full-screen "cover" fit.
        const targetSrc = (isMobile && isPortrait) ? 'assets/7890.mp4' : 'assets/123456.mp4';

        // Check current source to prevent unnecessary reloading
        const currentSrc = heroVideo.getAttribute('src');
        if (currentSrc !== targetSrc) {
            heroVideo.setAttribute('src', targetSrc);
            heroVideo.load();
            
            // Smooth fade-in once video is actually playing
            heroVideo.addEventListener('playing', () => {
                heroVideo.classList.add('is-playing');
            }, { once: true });

            heroVideo.play().catch(err => {
                console.warn("Autoplay prevented:", err);
            });
        }
    };

    // Initial load
    updateHeroVideoSource();

    // Stop background video loop when scrolling to other sections to save resources
    const mainHeroVideo = document.getElementById('hero-video');
    if (mainHeroVideo) {
        const videoObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    mainHeroVideo.play().catch(() => {});
                } else {
                    mainHeroVideo.pause();
                }
            });
        }, { threshold: 0 });
        videoObserver.observe(mainHeroVideo);
    }

    /* ==========================================================================
       4. Reservation Time-Slot Selection
       ========================================================================== */
    const dateInput = document.getElementById('date');
    const timeSlots = Array.from(document.querySelectorAll('.time-slot'));
    let selectedTime = '7:00 PM'; // Default active time

    // Helper to get local date string in YYYY-MM-DD format (prevents UTC timezone shifts)
    const getLocalDateString = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const updateAvailableTimeSlots = () => {
        if (!dateInput) return;
        
        const now = new Date();
        const todayStr = getLocalDateString();
        const isToday = dateInput.value === todayStr;
        
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        timeSlots.forEach(slot => {
            const timeStr = slot.textContent.trim();
            const [time, modifier] = timeStr.split(' ');
            let [hours, minutes] = time.split(':').map(Number);
            
            // Convert to 24-hour format for easier comparison
            if (hours === 12 && modifier === 'AM') hours = 0;
            else if (hours !== 12 && modifier === 'PM') hours += 12;
            
            const isPast = isToday && (hours < currentHour || (hours === currentHour && minutes <= currentMinute));
            slot.disabled = isPast;
            if (isPast) slot.classList.remove('active');
        });

        // Auto-select the first available slot if the current selection is now disabled
        const activeValidSlot = timeSlots.find(s => s.classList.contains('active') && !s.disabled);
        if (!activeValidSlot) {
            const firstValid = timeSlots.find(s => !s.disabled);
            if (firstValid) {
                timeSlots.forEach(s => s.classList.remove('active'));
                firstValid.classList.add('active');
                selectedTime = firstValid.textContent.trim();
            }
        }
    };

    if (dateInput) {
        const today = getLocalDateString();
        dateInput.value = today;
        dateInput.min = today;
        dateInput.addEventListener('change', updateAvailableTimeSlots);
    }

    updateAvailableTimeSlots();

    timeSlots.forEach(slot => {
        slot.addEventListener('click', () => {
            timeSlots.forEach(s => s.classList.remove('active'));
            slot.classList.add('active');
            selectedTime = slot.textContent.trim();
        });
    });

    const bookingForm = document.getElementById('booking-form');
    if (bookingForm) {
        bookingForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const phone = document.getElementById('phone').value;
            const date = document.getElementById('date').value;
            const guests = document.getElementById('guests').value;
            const occasion = document.getElementById('occasion').value;
            const requests = document.getElementById('requests').value;

            const bookingData = { name, email, phone, date, guests, time: selectedTime, occasion, requests };
            
            // Use the global API_URL defined at the top of the script
            fetch(`${API_URL}/api/reservations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingData)
            })
            .then(response => response.json())
            .then(data => {
                showToast(`Table reserved for ${name}! Check your email.`);
                bookingForm.reset();
                
                // Reset active time slot
                timeSlots.forEach(s => s.classList.remove('active'));
                const defaultSlot = document.querySelector('[data-time="19:00"]') || timeSlots[0];
                if (defaultSlot) {
                    defaultSlot.classList.add('active');
                    selectedTime = defaultSlot.textContent.trim();
                }
            })
            .catch(err => {
                console.error('Error:', err);
                showToast('Server connection failed.', 'error');
            });
        });
    }

    /* ==========================================================================
       6. Live Menu Search and Category Filtering
       ========================================================================== */
    const searchInput = document.getElementById('menu-search');
    const filterPills = Array.from(document.querySelectorAll('.filter-pill'));
    const menuCards = Array.from(document.querySelectorAll('.menu-card'));
    const menuCardData = menuCards.map(card => ({
        element: card,
        category: card.getAttribute('data-category') || 'all',
        title: card.querySelector('.card-title')?.textContent.toLowerCase() || '',
        desc: card.querySelector('.card-desc')?.textContent.toLowerCase() || ''
    }));

    const filterMenu = () => {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const activePill = document.querySelector('.filter-pill.active');
        const category = activePill ? activePill.getAttribute('data-category') : 'all';

        menuCardData.forEach(cardData => {
            const matchesSearch = cardData.title.includes(query) || cardData.desc.includes(query);
            const matchesCategory = category === 'all' || cardData.category === category;
            cardData.element.style.display = (matchesSearch && matchesCategory) ? 'flex' : 'none';
        });
    };

    if (searchInput) {
        searchInput.addEventListener('input', debounce(filterMenu, 120));
    }

    filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            filterMenu();
        });
    });

    /* ==========================================================================
       7. Customize Product Modal & Price Logic
       ========================================================================== */
    const openDetailButtons = document.querySelectorAll('.open-detail-btn');
    const closeBtn = document.getElementById('modal-close-btn');
    const optionsForm = document.getElementById('product-options-form');

    // Controls
    const qtyMinus = document.getElementById('qty-minus');
    const qtyPlus = document.getElementById('qty-plus');
    const qtyVal = document.getElementById('qty-val');
    const modalSubmitBtn = document.getElementById('modal-submit-btn');

    // Configuration values
    const BASE_PRICE = 649; // Korean Fried Chicken in Rupees
    let qty = 1;

    // Open Modal
    const handleOpenDetail = () => {
        openModal(detailModal);
        updateBodyScrollLock();
        resetModalValues();
        activateFocusTrap(detailModal);
    };

    // Close Modal
    const handleCloseDetail = () => {
        closeModal(detailModal);
        deactivateFocusTrap();
    };

    openDetailButtons.forEach(btn => {
        btn.addEventListener('click', handleOpenDetail);
    });

    if (closeBtn) closeBtn.addEventListener('click', handleCloseDetail);

    const closeAnyOpenOverlay = () => {
        const closeOverlay = document.getElementById('modal-close-overlay');
        if (detailModal && detailModal.classList.contains('open')) handleCloseDetail();
        if (paymentModal && paymentModal.classList.contains('open')) closePaymentModal();
        if (trackerModal && trackerModal.classList.contains('open')) closeTrackerModal();
        if (cartDrawer && cartDrawer.classList.contains('open')) closeCart();
    };

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAnyOpenOverlay();
        }
    });
    const closeOverlay = document.getElementById('modal-close-overlay');
    if (closeOverlay) closeOverlay.addEventListener('click', handleCloseDetail);

    // Escape key handling is consolidated at the end of the script.

    // Reset Form & Qty values on Modal Open
    const resetModalValues = () => {
        qty = 1;
        qtyVal.value = 1;
        if (optionsForm) {
            optionsForm.reset();
        }
        updatePrice();
    };

    // Quantity Handlers
    if (qtyMinus && qtyPlus && qtyVal) {
        qtyMinus.addEventListener('click', () => {
            if (qty > 1) {
                qty--;
                qtyVal.value = qty;
                updatePrice();
            }
        });

        qtyPlus.addEventListener('click', () => {
            qty++;
            qtyVal.value = qty;
            updatePrice();
        });
    }

    // Dynamic Price Calculator
    const calculateTotalPrice = () => {
        let additionalCost = 0;

        // 1. Spice level addon calculation (extra-hot adds 30 Rupees)
        const selectedSpice = document.querySelector('input[name="spice-level"]:checked');
        if (selectedSpice && selectedSpice.value === 'extra-hot') {
            additionalCost += 30;
        }

        // 2. Addons calculation
        const selectedAddons = document.querySelectorAll('input[name="addons"]:checked');
        selectedAddons.forEach(addon => {
            const price = parseFloat(addon.getAttribute('data-price')) || 0;
            additionalCost += price;
        });

        // 3. Quantity multiplication
        return (BASE_PRICE + additionalCost) * qty;
    };

    const updatePrice = () => {
        const total = calculateTotalPrice();
        if (modalSubmitBtn) {
            modalSubmitBtn.textContent = `Add to Cart • ₹${total}`;
        }
    };

    // Attach listeners on inputs to recalculate dynamically on choice shifts
    if (optionsForm) {
        optionsForm.addEventListener('change', updatePrice);
    }

    /* ==========================================================================
       8. Complete Interactive Live Cart System
       ========================================================================== */
    const cartIconWrapper = document.querySelector('.cart-icon-wrapper');
    const cartCloseBtn = document.getElementById('cart-close-btn');
    const cartItemsContainer = document.getElementById('cart-items-container');
    const cartBadge = document.querySelector('.cart-badge');
    const cartDrawerCount = document.getElementById('cart-drawer-count');
    const cartDrawerSubtotal = document.getElementById('cart-drawer-subtotal');
    const cartBtnTotal = document.getElementById('cart-btn-total');
    const cartCheckoutBtn = document.getElementById('cart-checkout-btn');
    const quickAddButtons = document.querySelectorAll('.add-to-cart-quick');

    // Load cart from localStorage or default to empty
    // Initialize with an empty array if localStorage is empty, otherwise load saved cart
    let cart = JSON.parse(localStorage.getItem('eateria_cart')) || [];
    const saveCart = () => localStorage.setItem('eateria_cart', JSON.stringify(cart));

    // Toggle Drawer Open/Close
    const openCart = () => {
        if (cartDrawer && cartOverlay) {
            openModal(cartDrawer);
            updateBodyScrollLock();
        }
    };

    const closeCart = () => {
        if (cartDrawer && cartOverlay) {
            cartDrawer.classList.remove('open');
            cartOverlay.classList.remove('open');
            updateBodyScrollLock();
        }
    };

    if (cartIconWrapper) cartIconWrapper.addEventListener('click', openCart);
    if (cartCloseBtn) cartCloseBtn.addEventListener('click', closeCart);
    if (cartOverlay) cartOverlay.addEventListener('click', closeCart);

    // Update entire Cart UI (items, totals, badge)
    const updateCartUI = () => {
        if (!cartItemsContainer) return;

        // Calculate totals
        let totalItems = 0;
        let subtotal = 0;

        cartItemsContainer.innerHTML = '';

        if (cart.length === 0) {
            cartItemsContainer.innerHTML = `
                <div class="cart-empty-state">
                    <span class="cart-empty-icon">🛒</span>
                    <p>Your culinary tray is empty.</p>
                </div>
            `;
        } else {
            cart.forEach(item => {
                totalItems += item.qty;
                subtotal += item.price * item.qty;

                const itemHTML = `
                    <div class="cart-item" data-id="${item.id}">
                        <div class="cart-item-info">
                            <h4 class="cart-item-title">${item.name}</h4>
                            <p class="cart-item-price">₹${item.price}</p>
                        </div>
                        <div class="cart-item-controls">
                            <button class="cart-qty-btn minus" data-id="${item.id}" aria-label="Decrease quantity">-</button>
                            <span class="cart-qty-val">${item.qty}</span>
                            <button class="cart-qty-btn plus" data-id="${item.id}" aria-label="Increase quantity">+</button>
                            <button class="cart-item-remove" data-id="${item.id}" aria-label="Remove item">
                                <svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M3 6h18"></path>
                                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                    <line x1="10" y1="11" x2="10" y2="17"></line>
                                    <line x1="14" y1="11" x2="14" y2="17"></line>
                                </svg>
                            </button>
                        </div>
                    </div>
                `;
                cartItemsContainer.insertAdjacentHTML('beforeend', itemHTML);
            });
        }

        saveCart(); // Save state on every UI update

        // Update Badge Count
        if (cartBadge) cartBadge.textContent = totalItems;
        if (cartDrawerCount) cartDrawerCount.textContent = totalItems;

        // Update Prices
        if (cartDrawerSubtotal) cartDrawerSubtotal.textContent = `₹${subtotal}`;
        if (cartBtnTotal) cartBtnTotal.textContent = `₹${subtotal}`;

        // Free delivery indicator
        const deliveryInfo = document.querySelector('.cart-delivery-info');
        if (deliveryInfo) {
            if (subtotal >= 500) {
                deliveryInfo.innerHTML = `<span><i class="fas fa-fire" style="margin-right: 6px;"></i> Free delivery active!</span>`;
                deliveryInfo.style.color = '#8CE36B';
                deliveryInfo.style.background = 'rgba(140, 227, 107, 0.08)';
            } else {
                const diff = 500 - subtotal;
                deliveryInfo.innerHTML = `<span>Spend ₹${diff} more for free delivery</span>`;
                deliveryInfo.style.color = 'var(--color-text-secondary)';
                deliveryInfo.style.background = 'rgba(255, 255, 255, 0.04)';
            }
        }
    };

    if (cartItemsContainer) {
        cartItemsContainer.addEventListener('click', (event) => {
            const btn = event.target.closest('button');
            if (!btn) return;

            const itemId = btn.getAttribute('data-id');
            if (!itemId) return;

            if (btn.classList.contains('plus')) {
                const item = cart.find(i => i.id === itemId);
                if (item) {
                    item.qty++;
                    updateCartUI();
                }
            } else if (btn.classList.contains('minus')) {
                const item = cart.find(i => i.id === itemId);
                if (item) {
                    if (item.qty > 1) {
                        item.qty--;
                    } else {
                        cart = cart.filter(i => i.id !== itemId);
                    }
                    updateCartUI();
                }
            } else if (btn.classList.contains('cart-item-remove')) {
                cart = cart.filter(i => i.id !== itemId);
                updateCartUI();
            }
        });
    }

    // Add Item to Cart Function
    const addItemToCart = (id, name, price, quantity = 1, sourceImg = null) => {
        // Premium "Fly to Cart" Animation using actual food image
        if (!checkIsMobile() && sourceImg && cartIconWrapper) {
            const flyingImg = sourceImg.cloneNode();
            const startRect = sourceImg.getBoundingClientRect();
            const endRect = cartIconWrapper.getBoundingClientRect();

            Object.assign(flyingImg.style, {
                position: 'fixed',
                left: `${startRect.left}px`,
                top: `${startRect.top}px`,
                width: `${startRect.width}px`,
                height: `${startRect.height}px`,
                zIndex: '9999',
                pointerEvents: 'none',
                borderRadius: 'var(--radius-md)',
                transition: 'all 0.8s cubic-bezier(0.19, 1, 0.22, 1)',
                opacity: '1'
            });

            document.body.appendChild(flyingImg);

            requestAnimationFrame(() => {
                flyingImg.style.left = `${endRect.left}px`;
                flyingImg.style.top = `${endRect.top}px`;
                flyingImg.style.width = '20px';
                flyingImg.style.height = '20px';
                flyingImg.style.opacity = '0';
                flyingImg.style.transform = 'rotate(20deg)';
            });

            setTimeout(() => flyingImg.remove(), 800);
        }

        const unitPrice = parseInt(price, 10) || 0;
        const existingItem = cart.find(item => item.id === id && item.price === unitPrice);
        if (existingItem) {
            existingItem.qty += quantity;
        } else {
            cart.push({ id, name, price: unitPrice, qty: quantity });
        }
        updateCartUI();

        // Feedback animation for the cart badge instead of opening the drawer
        if (cartBadge) {
            cartBadge.classList.remove('badge-bounce');
            void cartBadge.offsetWidth; // Trigger reflow to restart animation
            cartBadge.classList.add('badge-bounce');
        }

        showToast(`${name} added to tray`);
    };

    // Wire Custom Modification Modal Add to Cart
    if (optionsForm) {
        optionsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const total = calculateTotalPrice();
            
            // Collect customize selections to display neatly in cart item name
            let nameDesc = 'Custom Korean Fried Chicken';
            const selectedSpice = document.querySelector('input[name="spice-level"]:checked');
            if (selectedSpice) {
                nameDesc += ` (${selectedSpice.value.replace('-', ' ')})`;
            }

            // Since it's a dynamic order, add it to cart with the selected quantity
            const modalImg = detailModal.querySelector('.modal-img');
            addItemToCart('korean-chicken-custom', nameDesc, total / qty, qty, modalImg);
            closeModal(detailModal);
        });
    }

    quickAddButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const dishId = btn.getAttribute('data-id');
            const dishName = btn.getAttribute('data-name');
            const price = parseInt(btn.getAttribute('data-price'), 10);
            const cardImg = btn.closest('.menu-card').querySelector('.card-img');

            addItemToCart(dishId, dishName, price, 1, cardImg);
        });
    });

    // Wire Checkout button click (Triggers payment modal instead of plain alert!)
    const paymentCloseBtn = document.getElementById('payment-close-btn');
    const paymentCloseOverlay = document.getElementById('payment-close-overlay');
    const paymentSubtotal = document.getElementById('payment-subtotal');
    const paymentTotal = document.getElementById('payment-total');
    const payBtnAmount = document.getElementById('pay-btn-amount');
    const paymentForm = document.getElementById('payment-form');
    const paymentLoader = document.getElementById('payment-loader');

    const openPaymentModal = (subtotal) => {
        if (paymentModal) {
            if (paymentSubtotal) paymentSubtotal.textContent = `₹${subtotal}`;
            if (paymentTotal) paymentTotal.textContent = `₹${subtotal}`;
            if (payBtnAmount) payBtnAmount.textContent = `₹${subtotal}`;
            
            // Clean dynamic fields defaults
            const upiRadio = document.querySelector('input[value="upi"]');
            if (upiRadio) upiRadio.checked = true;
            togglePaymentFields('upi');

            openModal(paymentModal);
            updateBodyScrollLock();
            activateFocusTrap(paymentModal);
        }
    };

    const closePaymentModal = () => {
        if (paymentModal) {
            paymentModal.classList.remove('open');
            if (paymentLoader) paymentLoader.classList.remove('active');
            updateBodyScrollLock();
        }
    };

    if (cartCheckoutBtn) {
        cartCheckoutBtn.addEventListener('click', () => {
            if (cart.length === 0) {
                showToast('Your tray is empty!', 'error');
                return;
            }
            // Calculate current cart subtotal
            let subtotal = 0;
            cart.forEach(item => {
                subtotal += item.price * item.qty;
            });

            closeCart();
            openPaymentModal(subtotal);
        });
    }

    if (paymentCloseBtn) paymentCloseBtn.addEventListener('click', closePaymentModal);
    if (paymentCloseOverlay) paymentCloseOverlay.addEventListener('click', closePaymentModal);

    // Toggle Payment Option Fields
    const paymentMethodsRadios = document.querySelectorAll('input[name="payment-option"]');
    const paymentFields = document.querySelectorAll('.payment-fields');
    const paymentMethodsLabels = document.querySelectorAll('.payment-method');

    const togglePaymentFields = (value) => {
        // Toggle Active labels
        paymentMethodsLabels.forEach(label => {
            label.classList.remove('active');
        });
        const activeLabel = document.getElementById(`label-${value}`);
        if (activeLabel) activeLabel.classList.add('active');

        // Toggle Fields
        paymentFields.forEach(field => {
            field.classList.remove('active');
            const inputs = field.querySelectorAll('input');
            inputs.forEach(input => input.removeAttribute('required'));
        });

        const activeField = document.getElementById(`fields-${value}`);
        if (activeField) {
            activeField.classList.add('active');
            const inputs = activeField.querySelectorAll('input');
            inputs.forEach(input => input.setAttribute('required', ''));
        }
    };

    paymentMethodsRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            togglePaymentFields(e.target.value);
        });
    });

    // Handle Card number automatic spacing formatting
    const cardNumberInput = document.getElementById('card-number');
    if (cardNumberInput) {
        cardNumberInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
            let formattedValue = '';
            for (let i = 0; i < value.length; i++) {
                if (i > 0 && i % 4 === 0) {
                    formattedValue += ' ';
                }
                formattedValue += value[i];
            }
            e.target.value = formattedValue;
        });
    }

    // Handle Card Expiry formatting
    const cardExpiryInput = document.getElementById('card-expiry');
    if (cardExpiryInput) {
        cardExpiryInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
            if (value.length > 2) {
                e.target.value = value.slice(0, 2) + '/' + value.slice(2, 4);
            } else {
                e.target.value = value;
            }
        });
    }

    // Wire Payment Submit Process Action
    if (paymentForm) {
        paymentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (paymentLoader) paymentLoader.classList.add('active');

            const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
            const paymentMethod = document.querySelector('input[name="payment-option"]:checked').value;

            try {
                const response = await fetch(`${API_URL}/api/orders`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cart, paymentMethod, total })
                });

                if (response.ok) {
                    const data = await response.json();
                    showToast(`Order confirmed! ID: ${data.orderId}`);
                    
                    cart = [];
                    updateCartUI();
                    closePaymentModal();
                    setTimeout(() => openTrackerModal(), 600);
                } else {
                    showToast('Failed to place order. Please try again.', 'error');
                }
            } catch (err) {
                console.error('Order Error:', err);
                showToast('Server connection failed.', 'error');
            } finally {
                if (paymentLoader) paymentLoader.classList.remove('active');
            }
        });
    }


    /* ==========================================================================
       9. Rider Path Animation Logic
       ========================================================================== */
    const scooter = document.getElementById('rider-scooter');
    const stopDot = document.getElementById('rider-stop-dot');
    const routePath = document.querySelector('path.route-completed');
    const svg = document.querySelector('.tracking-route-svg svg');
    const mapEl = document.querySelector('.tracking-map');

    let progress = 0; // starts from the first waypoint dot
    let animationId = null;
    let speed = 0.0012;
    let svgRect, mapRect;

    function animateRider() {
      if (!routePath || !scooter || !svg || !mapEl) return;

      const totalLength = routePath.getTotalLength();
      const currentDist = totalLength * Math.min(progress, 1);
      const point = routePath.getPointAtLength(currentDist); // Stops exactly at the end of the red path

      // Calculate rotation based on the path's tangent for better visual accuracy
      const lookAhead = 2; 
      let angle;
      if (currentDist < totalLength - lookAhead) {
          const nextPoint = routePath.getPointAtLength(currentDist + lookAhead);
          angle = Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x) * (180 / Math.PI);
      } else {
          const prevPoint = routePath.getPointAtLength(Math.max(0, currentDist - lookAhead));
          angle = Math.atan2(point.y - prevPoint.y, point.x - prevPoint.x) * (180 / Math.PI);
      }

      const pixelX = point.x * (svgRect.width / 1200) + (svgRect.left - mapRect.left);
      const pixelY = point.y * (svgRect.height / 220) + (svgRect.top - mapRect.top);

      scooter.style.left = pixelX + 'px';
      scooter.style.top  = pixelY + 'px';
      scooter.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;

      if (progress < 1) {
        const increment = window.innerWidth <= 768 ? 0.009 : 0.009; // PC: 2x speed, Mobile: 1x speed
        progress += increment;
        animationId = requestAnimationFrame(animateRider);
      } else {
        if (stopDot) {
          stopDot.style.left = pixelX + 'px';
          stopDot.style.top  = pixelY + 'px';
          stopDot.style.display = 'block';
          stopDot.classList.add('pulse');
        }
        scooter.style.transform = ''; // Clear inline transform to allow CSS animation
        scooter.style.setProperty('--scooter-rot', `${angle}deg`);
        scooter.classList.add('floating');
      }
    }

    // Reset and restart animation
    function startRiderAnimation() {
      // Cancel any running animation first
      if (animationId) cancelAnimationFrame(animationId);

      // Reset everything
      progress = 0;
      speed = window.innerWidth <= 768 ? 0.009 : 0.009;
      scooter.style.opacity = '1';
      scooter.style.transition = 'none'; // Clear previous transitions to prevent interference
      scooter.classList.remove('floating');

      // Ensure the destination stop dot is hidden and reset for the new animation run
      if (stopDot) {
        stopDot.style.display = 'none';
        stopDot.classList.remove('pulse');
      }

      // Cache these once to prevent layout thrashing inside the animation loop
      svgRect = svg.getBoundingClientRect();
      mapRect = mapEl.getBoundingClientRect();

      // Delay so modal is fully visible before measuring positions
      setTimeout(() => {
        animationId = requestAnimationFrame(animateRider);
      }, 100);
    }

    /* ==========================================================================
       10. Complete Interactive Order Tracking Status Modal Script
       ========================================================================== */
    const trackOrderBtn = document.getElementById('track-order-btn');
    const trackerCloseBtn = document.getElementById('tracker-close-btn');
    const trackerCloseOverlay = document.getElementById('tracker-close-overlay');

    const closeTrackerModal = () => {
        if (trackerModal) {
            closeModal(trackerModal);
        }
    };

    const openTrackerModal = () => {
        if (trackerModal) {
            const mapImg = trackerModal.querySelector('.tracking-map-bg');
            const riderImg = trackerModal.querySelector('.rider-scooter');
            // Lazy load tracking assets only when modal is first opened
            if (mapImg && !mapImg.src) mapImg.src = 'images/ef759a90-3226-43c5-b793-ccbfe0e69030.webp';
            if (riderImg && !riderImg.src) riderImg.src = 'images/d323dc85-b17b-40db-b464-43229783fe6a(1).png';

            openModal(trackerModal);
            updateBodyScrollLock();
        }
    };

    // Trigger on track order button click
    if (trackOrderBtn) {
        trackOrderBtn.addEventListener('click', () => {
            openTrackerModal();
        });
    }
    if (trackerCloseBtn) trackerCloseBtn.addEventListener('click', closeTrackerModal);
    if (trackerCloseOverlay) trackerCloseOverlay.addEventListener('click', closeTrackerModal);

    // Handle Call Rider functionality
    const callRiderBtn = document.getElementById('call-rider-btn');
    if (callRiderBtn) {
        callRiderBtn.addEventListener('click', () => {
            showToast('📞 Connecting to Rahul Sharma...');
            // The tel: link in HTML will handle the dialer natively
        });
    }

    // Trigger via MutationObserver when modal gets 'open' class
    if (trackerModal) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    if (trackerModal.classList.contains('open')) {
                        startRiderAnimation();
                    } else {
                        // Stop the tracking animation loop and clear CSS infinite animations
                        if (animationId) {
                            cancelAnimationFrame(animationId);
                            animationId = null;
                        }
                        if (scooter) scooter.classList.remove('floating');
                        if (stopDot) stopDot.classList.remove('pulse');
                    }
                }
            });
        });
        observer.observe(trackerModal, { attributes: true });
    }

    // Initialize UI on first render
    updateCartUI();

    // State Restoration: Restore scroll and modal state after a breakpoint reload
    const savedScroll = sessionStorage.getItem('scrollPosition');
    if (savedScroll) {
        window.scrollTo(0, parseInt(savedScroll, 10));
        sessionStorage.removeItem('scrollPosition');
    }
    if (sessionStorage.getItem('trackerModalOpen') === 'true') {
        if (typeof openTrackerModal === 'function') openTrackerModal();
        sessionStorage.removeItem('trackerModalOpen');
    }

    /* ==========================================================================
       11. Responsive Screen Handling (Auto-Adjust & Breakpoint Refresh)
       ========================================================================== */
    let lastWidth = window.innerWidth;
    let lastOrientation = window.matchMedia('(orientation: portrait)').matches;
    
    const handleResize = () => {
        const currentWidth = window.innerWidth;
        const isMobile = checkIsMobile();
        const wasMobile = lastWidth <= 768;
        const isPortrait = window.matchMedia('(orientation: portrait)').matches;
        const wasPortrait = lastOrientation;

        // Update video source if crossing width breakpoint OR changing orientation
        if (isMobile !== wasMobile || isPortrait !== wasPortrait) {
            updateHeroVideoSource();
        }
        lastWidth = currentWidth;
        lastOrientation = isPortrait;

        // Recalibrate tracking assets if the modal is open during a resize
        if (trackerModal && trackerModal.classList.contains('open') && progress >= 1) {
            const svgRect = svg.getBoundingClientRect();
            const mapRect = mapEl.getBoundingClientRect();
            const totalLength = routePath.getTotalLength();
            const point = routePath.getPointAtLength(totalLength);
            
            const pixelX = point.x * (svgRect.width / 1200) + (svgRect.left - mapRect.left);
            const pixelY = point.y * (svgRect.height / 220) + (svgRect.top - mapRect.top);

            scooter.style.left = pixelX + 'px';
            scooter.style.top  = pixelY + 'px';
            if (stopDot) {
                stopDot.style.left = pixelX + 'px';
                stopDot.style.top  = pixelY + 'px';
            }
        }
    };

    window.addEventListener('resize', debounce(handleResize, 150));

    /* ==========================================================================
       App-like Navigation (Back Gesture Closes Modals)
       ========================================================================== */
    function openModal(element) {
        if (!element) return;
        element.classList.add("open");
        updateBodyScrollLock();

        // Handle internal overlays (like in tracker-modal or detail-modal)
        const overlay = element.querySelector('.modal-overlay');
        if (overlay) overlay.classList.add('open');

        if (element.id === 'cart-drawer' && cartOverlay) cartOverlay.classList.add('open');
        if (element.id === 'nav-menu' && mobileMenuToggle) mobileMenuToggle.classList.add('open');

        activateFocusTrap(element);
        history.pushState({ modalOpen: true }, "", window.location.href);
    }

    function closeModal(element) {
        if (!element) return;
        element.classList.remove("open");
        updateBodyScrollLock();

        // Handle internal overlays
        const overlay = element.querySelector('.modal-overlay');
        if (overlay) overlay.classList.remove('open');

        // Cleanup dependencies
        if (element.id === 'cart-drawer' && cartOverlay) cartOverlay.classList.remove('open');
        if (element.id === 'nav-menu' && mobileMenuToggle) mobileMenuToggle.classList.remove('open');
        
        deactivateFocusTrap();
    }

    window.addEventListener("popstate", () => {
        // Selectors matched to your existing ID/Class structure
        const tracker = document.getElementById('tracker-modal');
        const cart = document.getElementById('cart-drawer');
        const menu = document.getElementById('nav-menu');
        const detail = document.getElementById('detail-modal');
        const payment = document.getElementById('payment-modal');

        if (tracker?.classList.contains("open")) {
            closeTrackerModal();
            return;
        }
        if (cart?.classList.contains("open")) {
            closeCart();
            return;
        }
        if (menu?.classList.contains("open")) {
            closeModal(menu);
            return;
        }
        if (detail?.classList.contains("open")) {
            closeModal(detail);
            return;
        }
        if (payment?.classList.contains("open")) {
            closePaymentModal();
            return;
        }
    });

    // Initialize Lucide Icons
    if (typeof lucide !== 'undefined') lucide.createIcons();
});

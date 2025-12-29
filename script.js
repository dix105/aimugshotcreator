document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // CONFIGURATION & STATE
    // ==========================================
    const API_CONFIG = {
        userId: 'DObRu1vyStbUynoQmTcHBlhs55z2',
        effectId: 'mugshot',
        model: 'image-effects',
        toolType: 'image-effects'
    };

    let currentUploadedUrl = null;

    // ==========================================
    // DOM ELEMENTS
    // ==========================================
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const previewImage = document.getElementById('preview-image');
    const uploadContent = document.querySelector('.upload-content');
    const generateBtn = document.getElementById('generate-btn');
    const resetBtn = document.getElementById('reset-btn');
    const resultContainer = document.getElementById('result-container');
    const resultFinal = document.getElementById('result-final');
    const loadingState = document.getElementById('loading-state');
    const resultPlaceholder = document.querySelector('.result-placeholder');
    const downloadBtn = document.getElementById('download-btn');
    
    // Menu & UI Elements
    const menuToggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('header nav');

    // ==========================================
    // API HELPER FUNCTIONS
    // ==========================================

    // Generate nanoid for unique filename
    function generateNanoId(length = 21) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Upload file to CDN storage (called immediately when file is selected)
    async function uploadFile(file) {
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const uniqueId = generateNanoId();
        // Filename is just nanoid.extension
        const fileName = uniqueId + '.' + fileExtension;
        
        // Step 1: Get signed URL from API
        const signedUrlResponse = await fetch(
            'https://api.chromastudio.ai/get-emd-upload-url?fileName=' + encodeURIComponent(fileName),
            { method: 'GET' }
        );
        
        if (!signedUrlResponse.ok) {
            throw new Error('Failed to get signed URL: ' + signedUrlResponse.statusText);
        }
        
        const signedUrl = await signedUrlResponse.text();
        
        // Step 2: PUT file to signed URL
        const uploadResponse = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });
        
        if (!uploadResponse.ok) {
            throw new Error('Failed to upload file: ' + uploadResponse.statusText);
        }
        
        // Step 3: Return download URL
        const downloadUrl = 'https://contents.maxstudio.ai/' + fileName;
        return downloadUrl;
    }

    // Submit generation job
    async function submitImageGenJob(imageUrl) {
        const isVideo = API_CONFIG.model === 'video-effects';
        const endpoint = isVideo ? 'https://api.chromastudio.ai/video-gen' : 'https://api.chromastudio.ai/image-gen';
        
        const headers = {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'sec-ch-ua-platform': '"Windows"',
            'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
            'sec-ch-ua-mobile': '?0'
        };

        let body = {};
        if (isVideo) {
            body = {
                imageUrl: [imageUrl],
                effectId: API_CONFIG.effectId,
                userId: API_CONFIG.userId,
                removeWatermark: true,
                model: 'video-effects',
                isPrivate: true
            };
        } else {
            body = {
                model: API_CONFIG.model,
                toolType: API_CONFIG.toolType,
                effectId: API_CONFIG.effectId,
                imageUrl: imageUrl,
                userId: API_CONFIG.userId,
                removeWatermark: true,
                isPrivate: true
            };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            throw new Error('Failed to submit job: ' + response.statusText);
        }
        
        const data = await response.json();
        return data;
    }

    // Poll job status until completed or failed
    async function pollJobStatus(jobId) {
        const isVideo = API_CONFIG.model === 'video-effects';
        const baseUrl = isVideo ? 'https://api.chromastudio.ai/video-gen' : 'https://api.chromastudio.ai/image-gen';
        const POLL_INTERVAL = 2000; // 2 seconds
        const MAX_POLLS = 60; // Max 2 minutes
        let polls = 0;
        
        while (polls < MAX_POLLS) {
            const response = await fetch(
                `${baseUrl}/${API_CONFIG.userId}/${jobId}/status`,
                {
                    method: 'GET',
                    headers: { 'Accept': 'application/json, text/plain, */*' }
                }
            );
            
            if (!response.ok) {
                throw new Error('Failed to check status: ' + response.statusText);
            }
            
            const data = await response.json();
            
            if (data.status === 'completed') {
                return data;
            }
            
            if (data.status === 'failed' || data.status === 'error') {
                throw new Error(data.error || 'Job processing failed');
            }
            
            // Update UI
            updateStatusText('Processing... (' + (polls + 1) + ')');
            
            // Wait
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            polls++;
        }
        
        throw new Error('Job timed out after ' + MAX_POLLS + ' polls');
    }

    // ==========================================
    // UI HELPER FUNCTIONS
    // ==========================================

    function updateStatusText(text) {
        if (generateBtn) {
            // If processing, show spinner
            if (text.toLowerCase().includes('processing') || text.toLowerCase().includes('uploading')) {
                generateBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${text}`;
                generateBtn.disabled = true;
            } else if (text === 'READY') {
                generateBtn.innerHTML = '<i class="fa-solid fa-camera-flash"></i> Create Mugshot';
                generateBtn.disabled = false;
            }
        }
    }

    function showLoading() {
        if (loadingState) loadingState.classList.remove('hidden');
        if (resultPlaceholder) resultPlaceholder.classList.add('hidden');
        if (resultFinal) resultFinal.classList.add('hidden');
        
        // Hide potential video element from previous runs
        const prevVideo = document.getElementById('result-video');
        if (prevVideo) prevVideo.style.display = 'none';
        
        // Disable download
        if (downloadBtn) {
            downloadBtn.classList.add('disabled');
            downloadBtn.removeAttribute('href');
        }
    }

    function hideLoading() {
        if (loadingState) loadingState.classList.add('hidden');
    }

    function showResultMedia(url) {
        const isVideo = url.toLowerCase().match(/\.(mp4|webm)(\?.*)?$/i);
        
        if (isVideo) {
            // Hide image
            if (resultFinal) resultFinal.classList.add('hidden');
            
            // Show/Create video
            let video = document.getElementById('result-video');
            if (!video) {
                video = document.createElement('video');
                video.id = 'result-video';
                video.controls = true;
                video.autoplay = true;
                video.loop = true;
                video.className = 'w-full h-auto rounded-lg shadow-lg';
                if (resultContainer) resultContainer.appendChild(video);
            }
            video.src = url;
            video.style.display = 'block';
        } else {
            // Hide video
            const video = document.getElementById('result-video');
            if (video) video.style.display = 'none';
            
            // Show image
            if (resultFinal) {
                resultFinal.src = url;
                resultFinal.crossOrigin = 'anonymous'; // Helper for canvas download
                resultFinal.classList.remove('hidden');
            }
        }
        
        if (resultPlaceholder) resultPlaceholder.classList.add('hidden');
    }

    function showError(msg) {
        alert(msg);
        hideLoading();
        updateStatusText('READY'); // Reset button to allow retry
    }

    // ==========================================
    // LOGIC HANDLERS
    // ==========================================

    // Handle File Selection (Auto Upload)
    async function handleFileSelect(file) {
        if (!file.type.startsWith('image/')) {
            alert('Please upload a valid image file.');
            return;
        }

        try {
            // 1. Show Local Preview Immediately
            const reader = new FileReader();
            reader.onload = (e) => {
                if (previewImage) {
                    previewImage.src = e.target.result;
                    previewImage.classList.remove('hidden');
                }
                if (uploadContent) uploadContent.classList.add('hidden');
                if (resetBtn) resetBtn.classList.remove('hidden');
            };
            reader.readAsDataURL(file);

            // 2. Start Uploading
            updateStatusText('Uploading...');
            
            const uploadedUrl = await uploadFile(file);
            currentUploadedUrl = uploadedUrl;
            
            // 3. Ready to Generate
            updateStatusText('READY');

        } catch (error) {
            console.error('Upload error:', error);
            showError('Upload failed. Please try again.');
            // Reset UI slightly
            if (resetBtn) resetBtn.click();
        }
    }

    // Handle Generate Click
    async function handleGenerate() {
        if (!currentUploadedUrl) {
            alert('Please upload an image first.');
            return;
        }

        try {
            showLoading();
            updateStatusText('Processing...'); // Shows spinner

            // 1. Submit Job
            const jobData = await submitImageGenJob(currentUploadedUrl);
            
            // 2. Poll for Status
            const result = await pollJobStatus(jobData.jobId);
            
            // 3. Extract Result URL
            // Handle various API response formats
            const resultItem = Array.isArray(result.result) ? result.result[0] : result.result;
            const resultUrl = resultItem?.mediaUrl || resultItem?.video || resultItem?.image;
            
            if (!resultUrl) {
                throw new Error('API returned status completed but no image URL found.');
            }
            
            // 4. Update UI
            showResultMedia(resultUrl);
            hideLoading();
            updateStatusText('READY'); // Reset button text
            
            // 5. Enable Download
            if (downloadBtn) {
                downloadBtn.dataset.url = resultUrl;
                downloadBtn.classList.remove('disabled');
            }

        } catch (error) {
            console.error('Generation error:', error);
            showError('Generation failed: ' + error.message);
        }
    }

    // ==========================================
    // EVENT WIRING
    // ==========================================

    // File Input & Drag/Drop
    if (uploadZone && fileInput) {
        uploadZone.addEventListener('click', () => fileInput.click());
        
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = 'var(--primary)';
            uploadZone.classList.add('drag-over');
        });
        
        uploadZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = '';
            uploadZone.classList.remove('drag-over');
        });
        
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = '';
            uploadZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length) {
                handleFileSelect(e.dataTransfer.files[0]);
            }
        });
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) {
                handleFileSelect(e.target.files[0]);
            }
        });
    }

    // Generate Button
    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerate);
    }

    // Reset Button
    if (resetBtn) {
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Clear State
            currentUploadedUrl = null;
            fileInput.value = '';
            
            // Reset Preview Side
            if (previewImage) {
                previewImage.src = '';
                previewImage.classList.add('hidden');
            }
            if (uploadContent) uploadContent.classList.remove('hidden');
            if (resetBtn) resetBtn.classList.add('hidden');
            
            // Reset Generate Button
            if (generateBtn) {
                generateBtn.disabled = true;
                generateBtn.innerHTML = '<i class="fa-solid fa-camera-flash"></i> Create Mugshot';
            }
            
            // Reset Result Side
            if (resultFinal) resultFinal.classList.add('hidden');
            const vid = document.getElementById('result-video');
            if (vid) vid.style.display = 'none';
            if (resultPlaceholder) resultPlaceholder.classList.remove('hidden');
            if (loadingState) loadingState.classList.add('hidden');
            
            // Reset Download
            if (downloadBtn) {
                downloadBtn.classList.add('disabled');
                delete downloadBtn.dataset.url;
            }
        });
    }

    // Download Button (Robust Implementation)
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const url = downloadBtn.dataset.url;
            if (!url) return;
            
            const originalContent = downloadBtn.innerHTML;
            downloadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            downloadBtn.style.pointerEvents = 'none';
            
            try {
                // Strategy 1: Fetch as Blob (Forces download)
                const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
                if (!response.ok) throw new Error('Network response was not ok');
                
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                
                // Determine extension
                let ext = 'jpg';
                const type = response.headers.get('content-type') || '';
                if (type.includes('png')) ext = 'png';
                else if (type.includes('webp')) ext = 'webp';
                else if (type.includes('video') || url.match(/\.mp4/)) ext = 'mp4';
                
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = `mugshot_${generateNanoId(6)}.${ext}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                
            } catch (err) {
                console.warn('Direct download failed, trying fallback...', err);
                
                // Strategy 2: Canvas Fallback (Images Only)
                try {
                    const img = document.getElementById('result-final');
                    if (img && img.src === url && !url.match(/\.mp4/i)) {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth;
                        canvas.height = img.naturalHeight;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        
                        canvas.toBlob(blob => {
                            if (blob) {
                                const link = document.createElement('a');
                                link.href = URL.createObjectURL(blob);
                                link.download = `mugshot_${generateNanoId(6)}.png`;
                                link.click();
                            } else {
                                window.open(url, '_blank');
                            }
                        });
                    } else {
                        throw new Error('Not an image or image not loaded');
                    }
                } catch (canvasErr) {
                    // Strategy 3: Open in new tab
                    console.warn('Canvas fallback failed', canvasErr);
                    window.open(url, '_blank');
                }
            } finally {
                downloadBtn.innerHTML = originalContent;
                downloadBtn.style.pointerEvents = 'auto';
            }
        });
    }

    // ==========================================
    // EXISTING UI LOGIC (Menu, Modal, Scroll)
    // ==========================================
    
    // Mobile Menu
    if (menuToggle && nav) {
        menuToggle.addEventListener('click', () => {
            nav.classList.toggle('active');
            const icon = menuToggle.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-bars');
                icon.classList.toggle('fa-xmark');
            }
        });
        
        nav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('active');
                const icon = menuToggle.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-xmark');
                    icon.classList.add('fa-bars');
                }
            });
        });
    }

    // FAQ Accordion
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        if (question) {
            question.addEventListener('click', () => {
                const isActive = item.classList.contains('active');
                faqItems.forEach(i => i.classList.remove('active'));
                if (!isActive) item.classList.add('active');
            });
        }
    });

    // Modals
    const modalLinks = document.querySelectorAll('[data-modal-target]');
    const closeButtons = document.querySelectorAll('[data-modal-close]');
    
    function openModal(modalId) {
        const modal = document.getElementById(modalId + '-modal');
        if (modal) modal.classList.remove('hidden');
    }
    
    function closeModal(modalId) {
        const modal = document.getElementById(modalId + '-modal');
        if (modal) modal.classList.add('hidden');
    }
    
    modalLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('data-modal-target');
            openModal(target);
        });
    });
    
    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-modal-close');
            closeModal(target);
        });
    });
    
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.add('hidden');
        }
    });

    // Scroll Animations
    // Inject styles for scroll animation since we can't edit styles.css
    const animStyle = document.createElement('style');
    animStyle.textContent = `
        .anim-hidden { 
            opacity: 0; 
            transform: translateY(20px); 
            transition: opacity 0.6s ease-out, transform 0.6s ease-out; 
        }
        .fade-in { 
            opacity: 1; 
            transform: translateY(0); 
        }
    `;
    document.head.appendChild(animStyle);

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('section').forEach(section => {
        section.classList.add('anim-hidden'); // Apply initial hidden state
        observer.observe(section);
    });
});
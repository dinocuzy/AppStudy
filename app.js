// === GLOBAL STATE ===
let MASTER_DB = null;
let currentThreadData = null;
let currentImageIndex = 0;

// === ZOOM STATE ===
let zoomScale = 1;
let zoomPanX = 0, zoomPanY = 0;
let isDragging = false;
let dragStartX = 0, dragStartY = 0;
const MIN_ZOOM = 1, MAX_ZOOM = 5, ZOOM_STEP = 0.3;

// === DOM ELEMENTS ===
const screenHome = document.getElementById('screen-home');
const screenThread = document.getElementById('screen-thread');
const semesterContainer = document.getElementById('semester-container');

// Thread Elements
const btnBackHome = document.getElementById('btnBackHome');
const threadTitleDisplay = document.getElementById('thread-title-display');
const statTotal = document.getElementById('stat-total');
const statRepeated = document.getElementById('stat-repeated');
const imageGrid = document.getElementById('image-grid');

// Lightbox Elements
const lightbox = document.getElementById('lightbox');
const btnCloseLightbox = document.getElementById('btnCloseLightbox');
const lbImage = document.getElementById('lb-image');
const lbQuestionTitle = document.getElementById('lb-question-title');
const lbRepeatedInfo = document.getElementById('lb-repeated-info');
const lbRepeatedTerms = document.getElementById('lb-repeated-terms');
const lbOptionsList = document.getElementById('lb-options');
const btnRevealAnswer = document.getElementById('btnRevealAnswer');
const lbCorrectAnswerDisplay = document.getElementById('lb-correct-answer-display');
const lbCorrectLetter = document.getElementById('lb-correct-letter');

// Zoom Elements
const zoomContainer = document.getElementById('zoomContainer');
const zoomLabel = document.getElementById('zoomLabel');
document.getElementById('zoomIn').addEventListener('click', () => applyZoom(zoomScale + ZOOM_STEP));
document.getElementById('zoomOut').addEventListener('click', () => applyZoom(zoomScale - ZOOM_STEP));
document.getElementById('zoomReset').addEventListener('click', resetZoom);

// === MULTI-SELECT QUIZ STATE ===
let selectedAnswers = new Set(); // Tập hợp các đáp án đã chọn
let quizSubmitted = false;       // Đã nộp bài chưa

// === INIT ===
async function init() {
    try {
        const response = await fetch('master_db.json');
        MASTER_DB = await response.json();
        renderHome();
    } catch (e) {
        semesterContainer.innerHTML = `<div class="repeated-alert" style="color:red; background:rgba(255,0,0,0.1)">
            ❌ Lỗi: Không tải được master_db.json. Đảm bảo bạn đã chạy file build_db.py và đang dùng Local Server (python -m http.server)
        </div>`;
    }
}

function renderHome() {
    semesterContainer.innerHTML = '';

    // Sort semesters: dùng sort_key giảm dần => Gần nhất (FA25) -> Xa nhất (FA22)
    const semesters = Object.keys(MASTER_DB.semesters).sort((a, b) => {
        const keyA = MASTER_DB.semesters[a].sort_key || 0;
        const keyB = MASTER_DB.semesters[b].sort_key || 0;
        return keyB - keyA; // Giảm dần
    });

    semesters.forEach(sem => {
        const semData = MASTER_DB.semesters[sem];
        const threads = semData.threads || semData; // fallback nếu dùng db cũ

        const block = document.createElement('div');
        block.className = 'semester-block';

        const title = document.createElement('h2');
        title.className = 'semester-title';
        title.innerHTML = `📚 Học kỳ: ${sem}`;
        block.appendChild(title);

        const list = document.createElement('div');
        list.className = 'thread-list';

        threads.forEach(thread => {
            const card = document.createElement('div');
            card.className = 'thread-card glass-panel';

            let fireHtml = '';
            if (thread.repeated_count > 0) {
                fireHtml = `<span class="fire-tag">🔥 ${thread.repeated_count} Câu lặp</span>`;
            }

            card.innerHTML = `
                <div class="thread-info">
                    <h3>${thread.title}</h3>
                    <p>${thread.question_count} Câu hỏi</p>
                </div>
                ${fireHtml}
            `;

            card.addEventListener('click', () => openThread(thread.slug, thread.title));
            list.appendChild(card);
        });

        block.appendChild(list);
        semesterContainer.appendChild(block);
    });
}

// === THREAD NAVIGATION ===
function openThread(slug, title) {
    currentThreadData = MASTER_DB.threads[slug];
    
    // Update Stats
    threadTitleDisplay.textContent = title;
    statTotal.textContent = currentThreadData.length;
    statRepeated.textContent = currentThreadData.filter(q => q.is_repeated).length;
    
    // Render Grid
    imageGrid.innerHTML = '';
    currentThreadData.forEach((qData, index) => {
        const imgItem = document.createElement('div');
        imgItem.className = 'grid-item bg-dark';
        
        let fireBadge = '';
        if (qData.is_repeated) fireBadge = `<div class="grid-fire-badge">🔥 Tủ</div>`;
        
        // Correct path loading based on script storage folder structure
        const imgSrc = `fuoverflow_images/${slug}/${qData.image_file}`;
        
        imgItem.innerHTML = `
            <img src="${imgSrc}" loading="lazy" alt="Question Image">
            ${fireBadge}
            <div class="overlay">
                <span class="img-name">Câu ${index + 1}</span>
            </div>
        `;
        
        imgItem.addEventListener('click', () => openLightbox(index));
        imageGrid.appendChild(imgItem);
    });
    
    screenHome.classList.remove('active');
    screenThread.classList.add('active');
}

btnBackHome.addEventListener('click', () => {
    screenThread.classList.remove('active');
    screenHome.classList.add('active');
});

// === LIGHTBOX LOGIC ===
const fixedAbcd = document.getElementById('fixed-abcd');
const lbNavCounter = document.getElementById('lb-nav-counter');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');

function openLightbox(index) {
    currentImageIndex = index;
    _renderLightboxContent(index);
    lightbox.classList.add('show');
}

function _renderLightboxContent(index) {
    const qData = currentThreadData[index];
    const total = currentThreadData.length;
    const imgSrc = `fuoverflow_images/${qData.thread_slug}/${qData.image_file}`;

    lbImage.src = imgSrc;
    lbNavCounter.textContent = `${index + 1} / ${total}`;
    btnPrev.disabled = index === 0;
    btnNext.disabled = index === total - 1;

    lbQuestionTitle.textContent = qData.question || '(Chua co du lieu OCR - Xem anh ben trai)';

    if (qData.is_repeated && qData.appeared_in && qData.appeared_in.length > 0) {
        lbRepeatedInfo.classList.remove('hidden');
        lbRepeatedTerms.textContent = qData.appeared_in.join(', ');
    } else {
        lbRepeatedInfo.classList.add('hidden');
    }

    // Reset 4 fixed ABCD buttons
    selectedAnswers = new Set();
    quizSubmitted = false;
    fixedAbcd.querySelectorAll('.abcd-btn').forEach(btn => {
        btn.classList.remove('selected', 'correct', 'wrong');
        btn.disabled = false;
    });

    lbCorrectAnswerDisplay.classList.add('hidden');
    btnRevealAnswer.classList.remove('hidden');

    btnRevealAnswer.onclick = () => {
        if (quizSubmitted) return;
        quizSubmitted = true;
        revealAnswer(qData.voted_answer, selectedAnswers, qData);
    };

    // Ẩn nút Nộp bài — click ABCD là tự hiện đáp án luôn
    btnRevealAnswer.classList.add('hidden');

    initContribSection(qData);
    resetZoom();
}

// Wire ABCD buttons — click ngay lập tức so sánh với đáp án vote
fixedAbcd.querySelectorAll('.abcd-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (quizSubmitted) return;
        quizSubmitted = true;
        const k = btn.dataset.key;
        selectedAnswers.add(k);
        btn.classList.add('selected');
        // Lấy qData của câu hiện tại và reveal ngay
        const qData = currentThreadData[currentImageIndex];
        revealAnswer(qData.voted_answer, selectedAnswers, qData);
    });
});

// Prev / Next
btnPrev.addEventListener('click', () => {
    if (currentImageIndex > 0) { currentImageIndex--; _renderLightboxContent(currentImageIndex); }
});
btnNext.addEventListener('click', () => {
    if (currentImageIndex < currentThreadData.length - 1) { currentImageIndex++; _renderLightboxContent(currentImageIndex); }
});

// Keyboard navigation
document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('show')) return;
    if (e.key === 'ArrowRight') btnNext.click();
    if (e.key === 'ArrowLeft') btnPrev.click();
    if (e.key === 'Escape') lightbox.classList.remove('show');
});

// ========== ZOOM ENGINE ==========
function applyZoom(newScale) {
    zoomScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newScale));
    if (zoomScale === MIN_ZOOM) { zoomPanX = 0; zoomPanY = 0; }
    updateZoomTransform();
}

function resetZoom() {
    zoomScale = 1;
    zoomPanX = 0;
    zoomPanY = 0;
    updateZoomTransform();
}

function updateZoomTransform() {
    lbImage.style.transform = `scale(${zoomScale}) translate(${zoomPanX}px, ${zoomPanY}px)`;
    zoomLabel.textContent = `${Math.round(zoomScale * 100)}%`;
    zoomContainer.classList.toggle('zoomed', zoomScale > 1);
}

// Scroll Wheel Zoom
if (zoomContainer) {
    zoomContainer.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
        applyZoom(zoomScale + delta);
    }, { passive: false });

    // Drag to Pan khi đang Zoom
    zoomContainer.addEventListener('mousedown', (e) => {
        if (zoomScale <= 1) return;
        isDragging = true;
        dragStartX = e.clientX - zoomPanX * zoomScale;
        dragStartY = e.clientY - zoomPanY * zoomScale;
        zoomContainer.classList.add('grabbing');
        e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        zoomPanX = (e.clientX - dragStartX) / zoomScale;
        zoomPanY = (e.clientY - dragStartY) / zoomScale;
        updateZoomTransform();
    });
    window.addEventListener('mouseup', () => {
        isDragging = false;
        zoomContainer.classList.remove('grabbing');
    });

    // Double-click để reset zoom
    zoomContainer.addEventListener('dblclick', resetZoom);
}

// Removed handleQuizClick - replaced by fixed ABCD toggle above

function revealAnswer(correctKey, userSelections = new Set(), qData = {}) {
    const votedKeys = correctKey
        ? correctKey.split(',').map(k => k.trim().toUpperCase()).filter(k => /^[A-E]$/.test(k))
        : [];

    fixedAbcd.querySelectorAll('.abcd-btn').forEach(btn => {
        const k = btn.dataset.key;
        btn.disabled = true;
        btn.classList.remove('selected');
        if (votedKeys.includes(k))      btn.classList.add('correct');
        else if (userSelections.has(k)) btn.classList.add('wrong');
    });

    btnRevealAnswer.classList.add('hidden');
    if (votedKeys.length > 0) {
        lbCorrectAnswerDisplay.classList.remove('hidden');
        document.getElementById('lb-correct-label').textContent = 'Vote FUOverflow:';
        lbCorrectLetter.textContent = votedKeys.join(', ');
    } else {
        const ck = getContribKey(qData.thread_slug, qData.image_file);
        const cd = loadContribs(ck);
        if (Object.keys(cd).length > 0) {
            const top = Object.entries(cd).sort((a, b) => b[1] - a[1])[0][0];
            lbCorrectAnswerDisplay.classList.remove('hidden');
            document.getElementById('lb-correct-label').textContent = 'Cong dong:';
            lbCorrectLetter.textContent = top;
        }
    }
}

btnCloseLightbox.addEventListener('click', () => {
    lightbox.classList.remove('show');
});

// Chạm ra viền đen để thoát Lightbox
lightbox.addEventListener('click', (e) => {
    if(e.target === lightbox) lightbox.classList.remove('show');
});

// ========== CONTRIBUTION ENGINE (localStorage) ==========
const CONTRIB_KEY_PREFIX = 'learnwithdino_contrib_';
const contributeSection = document.getElementById('lb-contribute-section');
const contribTally = document.getElementById('contrib-tally');
const contribChoices = document.getElementById('contrib-choices');
const btnSubmitContrib = document.getElementById('btnSubmitContrib');
const contribFeedback = document.getElementById('contrib-feedback');

let currentContribKey = null;
let selectedContrib = null;

function getContribKey(threadSlug, imageFile) {
    return CONTRIB_KEY_PREFIX + threadSlug + '__' + imageFile;
}

function loadContribs(key) {
    try {
        return JSON.parse(localStorage.getItem(key) || '{}');
    } catch { return {}; }
}

function saveContrib(key, choice) {
    const data = loadContribs(key);
    data[choice] = (data[choice] || 0) + 1;
    localStorage.setItem(key, JSON.stringify(data));
    return data;
}

function renderContribTally(data) {
    contribTally.innerHTML = '';
    if (Object.keys(data).length === 0) {
        contribTally.innerHTML = '<p style="color:#888; font-size:12px; margin:0">Chưa có ai đóng góp. Hãy là người đầu tiên!</p>';
        return;
    }

    const total = Object.values(data).reduce((a, b) => a + b, 0);
    const topKey = Object.entries(data).sort((a, b) => b[1] - a[1])[0][0];

    ['A','B','C','D','E'].forEach(k => {
        const count = data[k] || 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const isTop = k === topKey && count > 0;
        const row = document.createElement('div');
        row.className = 'contrib-bar-row';
        row.innerHTML = `
            <span class="contrib-bar-label">${k}</span>
            <div class="contrib-bar-track">
                <div class="contrib-bar-fill ${isTop ? 'is-top' : ''}" style="width:${pct}%"></div>
            </div>
            <span class="contrib-bar-count">${count}</span>
        `;
        contribTally.appendChild(row);
    });
}

function initContribSection(qData) {
    const needsContrib = !qData.voted_answer || qData.voted_answer === 'N/A' ||
                         qData.voted_answer.includes('Chưa có') || qData.voted_answer.includes('Lỗi');

    if (!needsContrib) {
        contributeSection.classList.add('hidden');
        return;
    }

    contributeSection.classList.remove('hidden');
    currentContribKey = getContribKey(qData.thread_slug, qData.image_file);
    selectedContrib = null;
    btnSubmitContrib.disabled = true;
    contribFeedback.classList.add('hidden');
    contribFeedback.textContent = '';

    // Reset button states
    contribChoices.querySelectorAll('.contrib-btn').forEach(b => b.classList.remove('selected'));

    // Load and render existing tallies
    const existingData = loadContribs(currentContribKey);
    renderContribTally(existingData);

    // If user already voted from this session, show a note
    const myVote = sessionStorage.getItem(currentContribKey);
    if (myVote) {
        contribFeedback.classList.remove('hidden');
        contribFeedback.textContent = `✔ Bạn đã đóng góp đáp án ${myVote} trong phiên này.`;
    }
}

// Wire up contrib choice buttons
contribChoices.querySelectorAll('.contrib-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        contribChoices.querySelectorAll('.contrib-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedContrib = btn.dataset.choice;
        btnSubmitContrib.disabled = false;
    });
});

// Submit contribution
btnSubmitContrib.addEventListener('click', () => {
    if (!selectedContrib || !currentContribKey) return;

    const updatedData = saveContrib(currentContribKey, selectedContrib);
    sessionStorage.setItem(currentContribKey, selectedContrib); // track per session

    renderContribTally(updatedData);
    btnSubmitContrib.disabled = true;
    contribFeedback.classList.remove('hidden');
    contribFeedback.textContent = `🎉 Cảm ơn! Bạn đã đóng góp đáp án ${selectedContrib}.`;

    // Also update voted_answer display dynamically based on community top answer
    const topEntry = Object.entries(updatedData).sort((a, b) => b[1] - a[1])[0];
    if (topEntry) {
        lbCorrectAnswerDisplay.classList.remove('hidden');
        lbCorrectLetter.textContent = topEntry[0];
        lbCorrectAnswerDisplay.querySelector('span').textContent = '🤝 Cộng đồng chọn nhiều nhất:';
    }
});

// Bắt đầu
init();

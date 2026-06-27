class VocabMaster {
    constructor() {
        this.currentTab = 'cet4';
        this.currentLetter = 'all';
        this.searchQuery = '';
        this.selectedWords = new Set();
        this.currentMode = 'english';
        this.currentVoice = 'af_heart';
        this.speechRate = 0.9;
        this.isPlaying = false;
        this.playIndex = 0;
        this.playQueue = [];
        this.tts = null;
        this.voices = [];
        this.cet4Words = [];
        this.cet6Words = [];
        this.isTtsLoading = true;
        this.currentAudio = null;
        this.currentTimeout = null;
        this.isComposing = false;
        this.repeatCount = 1;
        
        this.letterNames = {
            'A': 'ay', 'B': 'bee', 'C': 'cee', 'D': 'dee', 'E': 'ee',
            'F': 'eff', 'G': 'jee', 'H': 'aitch', 'I': 'eye', 'J': 'jay',
            'K': 'kay', 'L': 'el', 'M': 'em', 'N': 'en', 'O': 'oh',
            'P': 'pee', 'Q': 'cue', 'R': 'ar', 'S': 'ess', 'T': 'tee',
            'U': 'you', 'V': 'vee', 'W': 'double-u', 'X': 'ex', 'Y': 'wy', 'Z': 'zee'
        };
        
        this.init();
    }
    
    async init() {
        this.bindEvents();
        
        try {
            const [cet4Data, cet6Data] = await Promise.all([
                this.loadData('data/cet4_words.json'),
                this.loadData('data/cet6_words.json')
            ]);
            
            this.cet4Words = cet4Data || [];
            this.cet6Words = cet6Data || [];
            
            this.renderAlphabetNav();
            this.renderWordList();
        } catch (error) {
            this.showError('无法加载词汇数据，请检查网络连接');
            console.error('Error loading data:', error);
        }
        
        this.initTTS();
    }
    
    async initTTS() {
        try {
            const loadingEl = document.getElementById('loadingOverlay');
            loadingEl.style.display = 'flex';
            document.querySelector('.loading-text').textContent = '正在加载语音引擎...';
            
            this.tts = await kokoro.KokoroTTS.from_pretrained(
                "onnx-community/Kokoro-82M-v1.0-ONNX",
                {
                    dtype: "q8",
                    device: "wasm"
                }
            );
            
            this.voices = await this.tts.list_voices();
            this.isTtsLoading = false;
            
            this.hideLoading();
            this.updateVoiceSelect();
        } catch (error) {
            console.error('Failed to initialize TTS:', error);
            this.isTtsLoading = false;
            this.hideLoading();
            this.showError('语音引擎加载失败，使用系统默认语音');
            this.initFallbackTTS();
        }
    }
    
    initFallbackTTS() {
        this.synth = window.speechSynthesis;
        this.voices = this.synth.getVoices().filter(v => v.lang.startsWith('en'));
        this.updateVoiceSelect();
        
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = () => {
                this.voices = this.synth.getVoices().filter(v => v.lang.startsWith('en'));
                this.updateVoiceSelect();
            };
        }
    }
    
    async loadData(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Network response was not ok');
            return await response.json();
        } catch (error) {
            console.warn(`Failed to load ${url}:`, error);
            return null;
        }
    }
    
    updateVoiceSelect() {
        const select = document.getElementById('voiceSelect');
        select.innerHTML = '<option value="">选择语音</option>';
        
        if (this.tts && this.voices.length > 0) {
            this.voices.forEach((voice, index) => {
                const option = document.createElement('option');
                option.value = voice.name;
                option.textContent = voice.name;
                select.appendChild(option);
            });
            
            select.value = this.currentVoice;
        } else if (this.synth && this.voices.length > 0) {
            this.voices.forEach((voice, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = voice.name;
                select.appendChild(option);
            });
            
            const defaultVoice = this.voices.find(v => v.default) || this.voices[0];
            const defaultIndex = this.voices.indexOf(defaultVoice);
            select.value = defaultIndex;
            this.currentVoice = defaultIndex;
        }
    }
    
    bindEvents() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
        
        document.getElementById('clearBtn').addEventListener('click', () => {
            this.clearSelection();
        });
        
        document.getElementById('selectedCount').addEventListener('click', () => {
            this.openSelectedModal();
        });
        
        document.getElementById('modalClose').addEventListener('click', () => {
            this.closeSelectedModal();
        });
        
        document.getElementById('modalOverlay').addEventListener('click', () => {
            this.closeSelectedModal();
        });
        
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setMode(e.target.dataset.mode);
            });
        });
        
        document.getElementById('voiceSelect').addEventListener('change', (e) => {
            this.currentVoice = e.target.value;
        });
        
        document.getElementById('speedRange').addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            this.setSpeed(value);
        });
        
        document.getElementById('playBtn').addEventListener('click', () => {
            this.playSelected();
        });
        
        document.getElementById('pauseBtn').addEventListener('click', () => {
            this.pausePlayback();
        });
        
        document.getElementById('stopBtn').addEventListener('click', () => {
            this.stopPlayback();
        });
        
        document.getElementById('repeatBtn').addEventListener('click', () => {
            this.toggleRepeat();
        });
        
        document.getElementById('mainContent').addEventListener('scroll', () => {
            this.handleScroll();
        });
        
        document.getElementById('backToTop').addEventListener('click', () => {
            this.scrollToTop();
        });
        
        document.getElementById('searchInput').addEventListener('input', (e) => {
            if (!this.isComposing) {
                this.handleSearch(e.target.value);
            }
        });
        
        document.getElementById('searchInput').addEventListener('compositionstart', () => {
            this.isComposing = true;
        });
        
        document.getElementById('searchInput').addEventListener('compositionend', (e) => {
            this.isComposing = false;
            this.handleSearch(e.target.value);
        });
        
        document.getElementById('searchInput').addEventListener('keyup', (e) => {
            if (!this.isComposing) {
                this.handleSearch(e.target.value);
            }
        });
        
        document.getElementById('searchClear').addEventListener('click', () => {
            this.clearSearch();
        });
    }
    
    switchTab(tab) {
        this.currentTab = tab;
        this.currentLetter = 'all';
        this.selectedWords.clear();
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        
        this.renderAlphabetNav();
        this.renderWordList();
        this.updateSelectedCount();
    }
    
    getCurrentWords() {
        let words = this.currentTab === 'cet4' ? this.cet4Words : this.cet6Words;
        
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            words = words.filter(word => 
                word.word.toLowerCase().startsWith(query)
            );
        } else if (this.currentLetter !== 'all') {
            words = words.filter(word => {
                const firstLetter = word.word.charAt(0).toUpperCase();
                return firstLetter === this.currentLetter;
            });
        }
        
        return words;
    }
    
    renderAlphabetNav() {
        const nav = document.getElementById('alphabetNav');
        nav.innerHTML = '';
        
        const allBtn = document.createElement('button');
        allBtn.className = `alphabet-btn all ${this.currentLetter === 'all' ? 'active' : ''}`;
        allBtn.textContent = '全部';
        allBtn.addEventListener('click', () => {
            this.filterByLetter('all');
        });
        nav.appendChild(allBtn);
        
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        const words = this.getCurrentWords();
        const availableLetters = new Set();
        
        words.forEach(word => {
            const firstLetter = word.word.charAt(0).toUpperCase();
            if (letters.includes(firstLetter)) {
                availableLetters.add(firstLetter);
            }
        });
        
        letters.forEach(letter => {
            if (availableLetters.has(letter)) {
                const btn = document.createElement('button');
                btn.className = `alphabet-btn ${this.currentLetter === letter ? 'active' : ''}`;
                btn.textContent = letter;
                btn.addEventListener('click', () => {
                    this.filterByLetter(letter);
                });
                nav.appendChild(btn);
            }
        });
    }
    
    filterByLetter(letter) {
        this.currentLetter = letter;
        this.searchQuery = '';
        document.getElementById('searchInput').value = '';
        document.getElementById('searchClear').style.display = 'none';
        
        this.renderAlphabetNav();
        this.renderWordList();
    }
    
    renderWordList() {
        const list = document.getElementById('wordList');
        list.innerHTML = '';
        
        const words = this.getCurrentWords();
        
        words.forEach(word => {
            const card = document.createElement('div');
            card.className = `word-card ${this.selectedWords.has(word.word) ? 'selected' : ''}`;
            
            card.innerHTML = `
                <div class="word-header">
                    <div class="word-checkbox"></div>
                    <div class="word-info">
                        <span class="word-text">${word.word}</span>
                        <span class="word-pos">${word.pos}</span>
                    </div>
                </div>
                <div class="word-definition">${word.definition}</div>
                <div class="word-example">${word.example}</div>
            `;
            
            card.addEventListener('click', () => {
                this.toggleWord(word.word);
                card.classList.toggle('selected');
            });
            
            list.appendChild(card);
        });
    }
    
    handleSearch(query) {
        const trimmedQuery = query.trim();
        this.searchQuery = trimmedQuery;
        
        const clearBtn = document.getElementById('searchClear');
        clearBtn.style.display = trimmedQuery ? 'flex' : 'none';
        
        if (trimmedQuery) {
            this.currentLetter = 'all';
        }
        
        this.renderAlphabetNav();
        this.renderWordList();
    }
    
    clearSearch() {
        this.searchQuery = '';
        document.getElementById('searchInput').value = '';
        document.getElementById('searchClear').style.display = 'none';
        
        this.renderAlphabetNav();
        this.renderWordList();
    }
    
    toggleWord(word) {
        if (this.selectedWords.has(word)) {
            this.selectedWords.delete(word);
        } else {
            this.selectedWords.add(word);
        }
        this.updateSelectedCount();
    }
    
    clearSelection() {
        this.selectedWords.clear();
        this.renderWordList();
        this.updateSelectedCount();
        this.stopPlayback();
    }
    
    updateSelectedCount() {
        document.getElementById('selectedCount').textContent = `已选 ${this.selectedWords.size} 词`;
    }
    
    openSelectedModal() {
        const modal = document.getElementById('selectedModal');
        modal.classList.add('show');
        this.renderSelectedList();
    }
    
    closeSelectedModal() {
        const modal = document.getElementById('selectedModal');
        modal.classList.remove('show');
    }
    
    renderSelectedList() {
        const listEl = document.getElementById('selectedList');
        const emptyEl = document.getElementById('emptyState');
        const words = this.currentTab === 'cet4' ? this.cet4Words : this.cet6Words;
        const selectedWordData = words.filter(w => this.selectedWords.has(w.word));
        
        if (selectedWordData.length === 0) {
            listEl.innerHTML = '';
            emptyEl.style.display = 'block';
            return;
        }
        
        emptyEl.style.display = 'none';
        listEl.innerHTML = '';
        
        selectedWordData.forEach(wordData => {
            const item = document.createElement('div');
            item.className = 'selected-item';
            
            item.innerHTML = `
                <div class="selected-item-info">
                    <div class="selected-item-word">${wordData.word}</div>
                    <div class="selected-item-def">${wordData.definition}</div>
                </div>
                <button class="remove-btn" data-word="${wordData.word}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            `;
            
            const removeBtn = item.querySelector('.remove-btn');
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeSelectedWord(wordData.word);
            });
            
            listEl.appendChild(item);
        });
    }
    
    removeSelectedWord(word) {
        this.selectedWords.delete(word);
        this.updateSelectedCount();
        this.renderWordList();
        this.renderSelectedList();
        
        if (this.selectedWords.size === 0) {
            this.closeSelectedModal();
        }
    }
    
    setMode(mode) {
        this.currentMode = mode;
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
    }
    
    setSpeed(value) {
        const speedMap = { 1: 0.5, 2: 0.7, 3: 0.9, 4: 1.1, 5: 1.3 };
        const labelMap = { 1: '慢', 2: '较慢', 3: '中', 4: '较快', 5: '快' };
        
        this.speechRate = speedMap[value];
        document.getElementById('speedValue').textContent = labelMap[value];
    }
    
    async speak(text, callback) {
        if (this.isTtsLoading) {
            this.currentTimeout = setTimeout(() => this.speak(text, callback), 100);
            return;
        }
        
        try {
            if (this.tts) {
                const isChinese = text.match(/[\u4e00-\u9fa5]/);
                
                if (isChinese) {
                    await this.speakChinese(text, callback);
                    return;
                }
                
                const audio = await this.tts.generate(text, {
                    voice: this.currentVoice,
                    speed: this.speechRate
                });
                
                const audioBlob = audio.getBlob();
                const audioUrl = URL.createObjectURL(audioBlob);
                const audioElement = new Audio(audioUrl);
                
                this.currentAudio = audioElement;
                
                audioElement.onended = () => {
                    URL.revokeObjectURL(audioUrl);
                    this.currentAudio = null;
                    if (callback) callback();
                };
                
                audioElement.onerror = () => {
                    URL.revokeObjectURL(audioUrl);
                    this.currentAudio = null;
                    if (callback) callback();
                };
                
                audioElement.play();
            } else {
                await this.speakFallback(text, callback);
            }
        } catch (error) {
            console.error('Speech error:', error);
            this.currentAudio = null;
            if (callback) callback();
        }
    }
    
    async speakChinese(text, callback) {
        try {
            const synth = window.speechSynthesis;
            const voices = synth.getVoices();
            const chineseVoice = voices.find(v => v.lang.startsWith('zh'));
            
            const utterance = new SpeechSynthesisUtterance(text);
            if (chineseVoice) {
                utterance.voice = chineseVoice;
            }
            utterance.lang = 'zh-CN';
            utterance.rate = this.speechRate;
            
            return new Promise((resolve) => {
                utterance.onend = () => {
                    if (callback) callback();
                    resolve();
                };
                utterance.onerror = () => {
                    if (callback) callback();
                    resolve();
                };
                synth.speak(utterance);
            });
        } catch (error) {
            console.error('Chinese speech error:', error);
            if (callback) callback();
        }
    }
    
    async speakFallback(text, callback) {
        try {
            const isChinese = text.match(/[\u4e00-\u9fa5]/);
            const utterance = new SpeechSynthesisUtterance(text);
            
            if (isChinese) {
                const voices = this.synth.getVoices();
                const chineseVoice = voices.find(v => v.lang.startsWith('zh'));
                if (chineseVoice) utterance.voice = chineseVoice;
                utterance.lang = 'zh-CN';
            } else {
                if (typeof this.currentVoice === 'number' && this.voices[this.currentVoice]) {
                    utterance.voice = this.voices[this.currentVoice];
                }
                utterance.lang = 'en-US';
            }
            
            utterance.rate = this.speechRate;
            
            return new Promise((resolve) => {
                utterance.onend = () => {
                    if (callback) callback();
                    resolve();
                };
                utterance.onerror = () => {
                    if (callback) callback();
                    resolve();
                };
                this.synth.speak(utterance);
            });
        } catch (error) {
            console.error('Fallback speech error:', error);
            if (callback) callback();
        }
    }
    
    speakLetter(letter, callback) {
        const letterUpper = letter.toUpperCase();
        this.speakWithSpeed(letterUpper, callback, this.speechRate * 1.4);
    }
    
    async speakWithSpeed(text, callback, speed) {
        if (this.isTtsLoading) {
            this.currentTimeout = setTimeout(() => this.speakWithSpeed(text, callback, speed), 100);
            return;
        }
        
        try {
            if (this.tts) {
                const audio = await this.tts.generate(text, {
                    voice: this.currentVoice,
                    speed: speed
                });
                
                const audioBlob = audio.getBlob();
                const audioUrl = URL.createObjectURL(audioBlob);
                const audioElement = new Audio(audioUrl);
                
                this.currentAudio = audioElement;
                
                audioElement.onended = () => {
                    URL.revokeObjectURL(audioUrl);
                    this.currentAudio = null;
                    if (callback) callback();
                };
                
                audioElement.onerror = () => {
                    URL.revokeObjectURL(audioUrl);
                    this.currentAudio = null;
                    if (callback) callback();
                };
                
                audioElement.play();
            } else {
                const utterance = new SpeechSynthesisUtterance(text);
                if (typeof this.currentVoice === 'number' && this.voices[this.currentVoice]) {
                    utterance.voice = this.voices[this.currentVoice];
                }
                utterance.lang = 'en-US';
                utterance.rate = speed;
                
                utterance.onend = () => { if (callback) callback(); };
                utterance.onerror = () => { if (callback) callback(); };
                this.synth.speak(utterance);
            }
        } catch (error) {
            console.error('Speech error:', error);
            this.currentAudio = null;
            if (callback) callback();
        }
    }
    
    async speakWord(wordData) {
        return new Promise((resolve) => {
            let currentRepeat = 0;
            
            const speakOnce = () => {
                if (!this.isPlaying) {
                    resolve();
                    return;
                }
                
                const speakNext = (step) => {
                    if (!this.isPlaying) {
                        resolve();
                        return;
                    }
                    switch (step) {
                        case 0:
                            this.speak(wordData.word, () => speakNext(step + 1));
                            break;
                        case 1:
                            if (this.currentMode === 'en-zh' || this.currentMode === 'full') {
                                this.speak(wordData.definition, () => speakNext(step + 1));
                            } else {
                                currentRepeat++;
                                if (currentRepeat < this.repeatCount) {
                                    this.currentTimeout = setTimeout(speakOnce, 300);
                                } else {
                                    resolve();
                                }
                            }
                            break;
                        case 2:
                            if (this.currentMode === 'full') {
                                const letters = wordData.word.split('');
                                let letterIndex = 0;
                                const speakLetterNext = () => {
                                    if (!this.isPlaying) {
                                        resolve();
                                        return;
                                    }
                                    if (letterIndex < letters.length) {
                                        this.speakLetter(letters[letterIndex], () => {
                                            letterIndex++;
                                            this.currentTimeout = setTimeout(speakLetterNext, 120);
                                        });
                                    } else {
                                        currentRepeat++;
                                        if (currentRepeat < this.repeatCount) {
                                            this.currentTimeout = setTimeout(speakOnce, 300);
                                        } else {
                                            this.currentTimeout = setTimeout(resolve, 300);
                                        }
                                    }
                                };
                                speakLetterNext();
                            } else {
                                currentRepeat++;
                                if (currentRepeat < this.repeatCount) {
                                    this.currentTimeout = setTimeout(speakOnce, 300);
                                } else {
                                    resolve();
                                }
                            }
                            break;
                    }
                };
                speakNext(0);
            };
            
            speakOnce();
        });
    }
    
    toggleRepeat() {
        this.repeatCount = this.repeatCount >= 5 ? 1 : this.repeatCount + 1;
        document.querySelector('.repeat-text').textContent = `×${this.repeatCount}`;
    }
    
    async playSelected() {
        if (this.isTtsLoading) {
            this.showError('语音引擎正在加载中，请稍候');
            return;
        }
        
        if (this.selectedWords.size === 0) {
            this.showError('请先选择单词');
            return;
        }
        
        const words = this.currentTab === 'cet4' ? this.cet4Words : this.cet6Words;
        this.playQueue = words.filter(w => this.selectedWords.has(w.word));
        
        if (this.playQueue.length === 0) {
            this.showError('选择的单词不在当前词库中');
            return;
        }
        
        this.isPlaying = true;
        this.playIndex = 0;
        
        document.getElementById('playBtn').disabled = true;
        document.getElementById('pauseBtn').disabled = false;
        document.getElementById('stopBtn').disabled = false;
        
        await this.playNextWord();
    }
    
    async playNextWord() {
        if (!this.isPlaying || this.playIndex >= this.playQueue.length) {
            this.stopPlayback();
            return;
        }
        
        const wordData = this.playQueue[this.playIndex];
        
        document.getElementById('currentWordText').textContent = wordData.word;
        document.getElementById('currentWordPhonetic').textContent = wordData.definition;
        
        await this.speakWord(wordData);
        
        this.playIndex++;
        
        if (this.isPlaying) {
            this.currentTimeout = setTimeout(() => this.playNextWord(), 500);
        }
    }
    
    pausePlayback() {
        this.isPlaying = false;
        
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = null;
        }
        
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }
        
        if (this.synth) {
            this.synth.cancel();
        }
        
        document.getElementById('playBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = true;
    }
    
    stopPlayback() {
        this.isPlaying = false;
        this.playIndex = 0;
        this.playQueue = [];
        
        if (this.currentTimeout) {
            clearTimeout(this.currentTimeout);
            this.currentTimeout = null;
        }
        
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }
        
        if (this.synth) {
            this.synth.cancel();
        }
        
        document.getElementById('playBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = true;
        document.getElementById('stopBtn').disabled = true;
        
        document.getElementById('currentWordText').textContent = '';
        document.getElementById('currentWordPhonetic').textContent = '';
    }
    
    handleScroll() {
        const mainContent = document.getElementById('mainContent');
        const backToTop = document.getElementById('backToTop');
        
        if (mainContent.scrollTop > 200) {
            backToTop.classList.add('show');
        } else {
            backToTop.classList.remove('show');
        }
    }
    
    scrollToTop() {
        const mainContent = document.getElementById('mainContent');
        mainContent.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
    
    showError(message) {
        const errorEl = document.getElementById('errorMessage');
        errorEl.textContent = message;
        errorEl.classList.add('show');
        setTimeout(() => {
            errorEl.classList.remove('show');
        }, 3000);
    }
    
    hideLoading() {
        document.getElementById('loadingOverlay').style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new VocabMaster();
});
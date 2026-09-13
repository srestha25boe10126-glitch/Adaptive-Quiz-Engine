# Adaptive Quiz Engine

A production-ready, turn-by-turn active-recall single-page web application that converts study material into multiple-choice quiz questions using a deterministic heuristic parser and adapts question difficulty to the user's performance in real time.

Runs completely offline by opening `index.html` in any modern web browser — zero build steps, zero external CDNs, zero third-party libraries.

---

## Key Features

1. **Deterministic Active-Recall Question Generation**:
   - **Sentence Segmentation**: Punctuation-aware boundary splitting with abbreviation protection (`e.g.`, `i.e.`, `Dr.`, `vs.`, decimals).
   - **Salience Scoring**: Heuristically weights definitional patterns (`is defined as`, `refers to`, `consists of`), causal connectors (`because`, `therefore`, `leads to`), numeric facts, and named entities. Discards transitional filler.
   - **Key Phrase Extraction**: Masks salient noun phrases or entities to form targeted fill-in-the-blank or interrogative stems.
   - **Distractor Generation Pipeline**:
     - *Priority 1*: Pulls domain entities and technical terms from other sentences in the same source document.
     - *Priority 2*: Semantic antonym/polarity flips (`aerobic` ↔ `anaerobic`, `increases` ↔ `decreases`, `active` ↔ `passive`, etc.).
     - *Priority 3*: Plausible numeric perturbation and modifier contrast.
     - *Quality Gate*: Enforces answer deduplication, character length parity (±40%), and checks that the question stem does not give away the answer.
2. **Multi-Format Offline Input**:
   - **Paste Text**: Direct input with live character counter (minimum 200 characters).
   - **Plain Text / Markdown (`.txt`, `.md`)**: Loaded via native `FileReader`.
   - **PDF Extraction (`.pdf`)**: Pure vanilla JS stream extractor searching internal text operators (`Tj`, `TJ`) and uncompressing `FlateDecode` streams via native `DecompressionStream`.
   - **DOCX Extraction (`.docx`)**: Pure vanilla JS ZIP archive unpacker for `word/document.xml` using `DecompressionStream('deflate-raw')` and XML node parsing.
   - **Mandatory Preview**: Extracted text is always displayed in an editable review textarea before quiz generation.
3. **Turn-by-Turn Adaptive Quiz**:
   - Immediate feedback drawer displaying verdict, source-cited rationale, common misconceptions, and memory hooks.
   - Dynamic adaptive tier progression: **Novice (Level 1)** → **Apprentice (Level 2)** → **Practitioner (Level 3)** → **Master (Level 4)**.
   - Full session persistence to `localStorage` (`aqe_state`) with mid-session resume prompt upon page reload.
   - Keyboard shortcuts: `1`, `2`, `3`, `4` select options, `Enter` advances to next question, `Esc` opens the exit dialog.
4. **Cognitive Analytics & Export**:
   - Hand-crafted 5-axis **SVG Radar Chart** (Accuracy, Speed, Streak, Consistency, Difficulty Reached).
   - **SVG Mastery Progression Curve** showing rating changes turn-by-turn.
   - Diagnostic takeaway identifying the weakest concept.
   - **Spaced-Recall Mistake Bank** (`aqe_mistakes`) for targeted re-practice.
   - One-click export to `.json` or printable standalone `.html` study sheet with answer key.
5. **Web Audio API Soundscape**:
   - Synthesized chimes for correct answers, buzz for incorrect attempts, and fanfare for completion. Includes global mute toggle.
6. **Cyber-Minimalist Design**:
   - Custom properties design system with dark and light themes.
   - Backdrop blur glassmorphism, responsive flexbox and grid layouts.

---

## File Structure

```
├── index.html       # Semantic HTML5 layout, HUD, quiz containers, modals
├── styles.css       # CSS custom properties, glassmorphism, animations, dark/light themes
├── app.js           # Vanilla ES2020+ modular engine (StorageManager, SoundEngine, AdaptiveEngine, FileParser, QuestionGenerator, QuizEngine, UIManager)
└── README.md        # Technical architecture and documentation
```

---

## Getting Started

1. Open `index.html` directly in Google Chrome, Microsoft Edge, Mozilla Firefox, or Apple Safari.
2. Choose one of the curated sample materials (Biology, Systems, or Economics) or paste your own study text (≥200 characters).
3. Set your target question count and starting difficulty, then click **Generate & Start Active-Recall Quiz**.
4. Test your knowledge turn-by-turn and inspect your cognitive radar chart upon completion!

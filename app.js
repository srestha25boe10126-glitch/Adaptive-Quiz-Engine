/**
 * ============================================================================
 * ADAPTIVE QUIZ ENGINE — APPLICATION CORE (Vanilla ES2020+)
 *
 * An interactive, turn-by-turn active-recall quiz generator that turns
 * source materials into adaptive multiple-choice questions using a
 * deterministic heuristic parsing pipeline.
 *
 * Zero external libraries. Zero CDN dependencies. Pure offline execution.
 * ============================================================================
 */

(() => {
  'use strict';

  /* ==========================================================================
     1. STORAGE MANAGER
     Wraps LocalStorage with key namespacing, serialization, and error trapping.
     ========================================================================== */
  const StorageManager = {
    KEYS: {
      STATE: 'aqe_state',
      HISTORY: 'aqe_history',
      MISTAKES: 'aqe_mistakes',
      SETTINGS: 'aqe_settings'
    },

    saveState(state) {
      try {
        localStorage.setItem(this.KEYS.STATE, JSON.stringify(state));
      } catch (err) {
        console.warn('Failed to save state to LocalStorage:', err);
      }
    },

    loadState() {
      try {
        const raw = localStorage.getItem(this.KEYS.STATE);
        return raw ? JSON.parse(raw) : null;
      } catch (err) {
        console.warn('Failed to load state from LocalStorage:', err);
        return null;
      }
    },

    clearState() {
      try {
        localStorage.removeItem(this.KEYS.STATE);
      } catch (err) {
        console.warn('Failed to clear state:', err);
      }
    },

    saveHistory(attempt) {
      try {
        const history = this.getHistory();
        history.unshift(attempt);
        // Keep at most 50 recent attempts
        if (history.length > 50) history.pop();
        localStorage.setItem(this.KEYS.HISTORY, JSON.stringify(history));
      } catch (err) {
        console.warn('Failed to save history:', err);
      }
    },

    getHistory() {
      try {
        const raw = localStorage.getItem(this.KEYS.HISTORY);
        return raw ? JSON.parse(raw) : [];
      } catch (err) {
        console.warn('Failed to load history:', err);
        return [];
      }
    },

    clearHistory() {
      try {
        localStorage.removeItem(this.KEYS.HISTORY);
      } catch (err) {
        console.warn('Failed to clear history:', err);
      }
    },

    addMistake(mistakeItem) {
      try {
        const mistakes = this.getMistakes();
        // Avoid duplicate stems
        const exists = mistakes.some(m => m.stem === mistakeItem.stem);
        if (!exists) {
          mistakes.unshift(mistakeItem);
          if (mistakes.length > 100) mistakes.pop();
          localStorage.setItem(this.KEYS.MISTAKES, JSON.stringify(mistakes));
        }
      } catch (err) {
        console.warn('Failed to add mistake:', err);
      }
    },

    getMistakes() {
      try {
        const raw = localStorage.getItem(this.KEYS.MISTAKES);
        return raw ? JSON.parse(raw) : [];
      } catch (err) {
        console.warn('Failed to load mistakes:', err);
        return [];
      }
    },

    clearMistakes() {
      try {
        localStorage.removeItem(this.KEYS.MISTAKES);
      } catch (err) {
        console.warn('Failed to clear mistakes:', err);
      }
    },

    getSettings() {
      try {
        const raw = localStorage.getItem(this.KEYS.SETTINGS);
        return raw ? JSON.parse(raw) : { isMuted: false, theme: 'dark' };
      } catch (err) {
        return { isMuted: false, theme: 'dark' };
      }
    },

    saveSettings(settings) {
      try {
        localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(settings));
      } catch (err) {
        console.warn('Failed to save settings:', err);
      }
    }
  };

  /* ==========================================================================
     2. SOUND ENGINE
     Web Audio API synthesizer for crisp, retro-modern feedback cues.
     ========================================================================== */
  const SoundEngine = {
    audioCtx: null,

    getAudioContext() {
      if (!this.audioCtx) {
        const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        if (AudioCtxClass) {
          this.audioCtx = new AudioCtxClass();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      return this.audioCtx;
    },

    isMuted() {
      return StorageManager.getSettings().isMuted;
    },

    playCorrect() {
      if (this.isMuted()) return;
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      // Rising pleasant two-tone chime (E5 -> A5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now); // E5
      gain1.gain.setValueAtTime(0.18, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.18);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880.0, now + 0.1); // A5
      gain2.gain.setValueAtTime(0.22, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.38);
    },

    playWrong() {
      if (this.isMuted()) return;
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      // Low descending buzz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.linearRampToValueAtTime(110, now + 0.28);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.28);
    },

    playComplete() {
      if (this.isMuted()) return;
      const ctx = this.getAudioContext();
      if (!ctx) return;

      // 4-note ascending fanfare (C5, E5, G5, C6)
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const startTime = ctx.currentTime + idx * 0.12;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.18, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.3);
      });
    },

    playClick() {
      if (this.isMuted()) return;
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(900, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    }
  };

  /* ==========================================================================
     3. ADAPTIVE ENGINE
     Dynamic player rating model and difficulty tier mapping.
     ========================================================================== */
  const AdaptiveEngine = {
    TIERS: [
      { min: 0, level: 1, name: 'Novice', chipClass: 'tier-1' },
      { min: 1100, level: 2, name: 'Apprentice', chipClass: 'tier-2' },
      { min: 1300, level: 3, name: 'Practitioner', chipClass: 'tier-3' },
      { min: 1500, level: 4, name: 'Master', chipClass: 'tier-4' }
    ],

    getCurrentTier(rating) {
      let active = this.TIERS[0];
      for (const tier of this.TIERS) {
        if (rating >= tier.min) {
          active = tier;
        }
      }
      return active;
    },

    recordAnswer(currentRating, isCorrect, timeMs, currentStreak) {
      let newRating = currentRating;
      if (isCorrect) {
        // Base gain
        let delta = 35;
        // Speed bonus: answered in under 8 seconds
        if (timeMs < 8000) delta += 10;
        else if (timeMs < 15000) delta += 5;
        // Streak bonus
        if (currentStreak >= 3) delta += 10;
        newRating += delta;
      } else {
        // Base penalty
        const penalty = 28;
        newRating = Math.max(800, newRating - penalty);
      }
      return Math.round(newRating);
    }
  };

  /* ==========================================================================
     4. FILE PARSER
     Pure vanilla JS extraction for TXT, MD, PDF text streams, and DOCX ZIPs.
     ========================================================================== */
  const FileParser = {
    /**
     * Entry point for reading an uploaded file
     */
    async parseFile(file) {
      const ext = file.name.split('.').pop().toLowerCase();

      if (ext === 'txt' || ext === 'md') {
        const text = await this.readAsText(file);
        return { text, warning: null };
      }

      if (ext === 'pdf') {
        return await this.parsePDF(file);
      }

      if (ext === 'docx') {
        return await this.parseDOCX(file);
      }

      throw new Error(`Unsupported file type: .${ext}. Please use .txt, .pdf, .docx, or .md.`);
    },

    readAsText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Failed to read file as text.'));
        reader.readAsText(file);
      });
    },

    readAsArrayBuffer(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Failed to read file buffer.'));
        reader.readAsArrayBuffer(file);
      });
    },

    /**
     * Pure Vanilla JS PDF Text Stream Extractor
     * - Decompresses FlateDecode streams using native DecompressionStream.
     * - Decodes /ToUnicode CMaps (beginbfchar / beginbfrange) for subsetted fonts.
     * - Parses text operators (Tj, TJ, ', ") strictly within BT ... ET blocks.
     * - Filters out binary image and font streams.
     * - Detects garbled/gibberish font encodings and prompts the user gracefully.
     */
    async parsePDF(file) {
      const buffer = await this.readAsArrayBuffer(file);
      const uint8 = new Uint8Array(buffer);
      const latin1Text = new TextDecoder('latin1').decode(uint8);

      const cmapTable = {};
      const contentStreams = [];

      // Regex to find all PDF stream blocks: stream\r?\n ... endstream
      const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
      let match;

      while ((match = streamRegex.exec(latin1Text)) !== null) {
        const streamStart = match.index + match[0].indexOf('\n') + 1;
        const streamData = match[1];
        const streamEnd = streamStart + streamData.length;

        // Inspect stream dictionary before 'stream' keyword
        const headerSlice = latin1Text.substring(Math.max(0, match.index - 2500), match.index);

        // Skip image streams, font file tables, and binary objects
        if (headerSlice.includes('/Subtype /Image') ||
            headerSlice.includes('/Subtype/Image') ||
            headerSlice.includes('/Filter /DCTDecode') ||
            headerSlice.includes('/Filter/DCTDecode') ||
            headerSlice.includes('/Filter /JPXDecode') ||
            headerSlice.includes('/FontFile')) {
          continue;
        }

        const isFlate = headerSlice.includes('/FlateDecode') || headerSlice.includes('/Fl');
        let decodedText = null;

        if (isFlate) {
          try {
            const rawBytes = uint8.subarray(streamStart, streamEnd);
            let decompressedBytes = null;

            if (typeof DecompressionStream !== 'undefined') {
              try {
                const ds = new DecompressionStream('deflate');
                const stream = new Response(rawBytes).body.pipeThrough(ds);
                decompressedBytes = new Uint8Array(await new Response(stream).arrayBuffer());
              } catch (e1) {
                // Try raw deflate by skipping 2-byte zlib header
                if (rawBytes.length > 2) {
                  try {
                    const dsRaw = new DecompressionStream('deflate-raw');
                    const streamRaw = new Response(rawBytes.subarray(2)).body.pipeThrough(dsRaw);
                    decompressedBytes = new Uint8Array(await new Response(streamRaw).arrayBuffer());
                  } catch (e2) {
                    // Stream failed
                  }
                }
              }
            }

            if (decompressedBytes) {
              decodedText = new TextDecoder('latin1').decode(decompressedBytes);
            }
          } catch (err) {
            // Ignore corrupted stream
          }
        } else {
          decodedText = streamData;
        }

        if (decodedText) {
          // Check if this stream is a ToUnicode CMap
          if (decodedText.includes('beginbfchar') || decodedText.includes('beginbfrange')) {
            this.parseCMap(decodedText, cmapTable);
          }
          // Check if this stream contains text operators (BT ... ET)
          if (decodedText.includes('BT') && (decodedText.includes('Tj') || decodedText.includes('TJ') || decodedText.includes('ET'))) {
            contentStreams.push(decodedText);
          }
        }
      }

      // Extract text from content streams using CMap
      const extractedPieces = [];
      for (const streamContent of contentStreams) {
        this.extractTextFromContentStream(streamContent, cmapTable, extractedPieces);
      }

      let cleanedText = extractedPieces
        .join(' ')
        .replace(/\\([()\\])/g, '$1')
        .replace(/(\w+)-\s+(\w+)/g, '$1$2') // Rejoin words hyphenated across lines
        .replace(/\s+/g, ' ')
        .trim();

      // Assess quality / gibberish
      const quality = this.checkTextQuality(cleanedText);

      return {
        text: cleanedText,
        isGibberish: quality.isGibberish,
        warning: quality.isGibberish ? quality.reason : (cleanedText.length < 200 ? 'Source text is very brief — paste more text for optimal questions.' : null)
      };
    },

    /**
     * Parses PDF /ToUnicode CMap tables (beginbfchar & beginbfrange)
     */
    parseCMap(cmapText, cmapTable) {
      // 1. Single character mappings: <srcHex> <dstHex>
      const bfcharRegex = /<([0-9a-fA-F]+)>\s+<([0-9a-fA-F]+)>/g;
      let m;
      while ((m = bfcharRegex.exec(cmapText)) !== null) {
        const srcHex = m[1].toLowerCase();
        const dstHex = m[2];
        let charStr = '';
        for (let i = 0; i < dstHex.length; i += 4) {
          const code = parseInt(dstHex.substr(i, 4), 16);
          if (!isNaN(code) && code > 0) {
            charStr += String.fromCharCode(code);
          }
        }
        if (charStr) {
          cmapTable[srcHex] = charStr;
        }
      }

      // 2. Range mappings: <startSrc> <endSrc> <startDst>
      const bfrangeRegex = /<([0-9a-fA-F]+)>\s+<([0-9a-fA-F]+)>\s+<([0-9a-fA-F]+)>/g;
      while ((m = bfrangeRegex.exec(cmapText)) !== null) {
        const startSrc = parseInt(m[1], 16);
        const endSrc = parseInt(m[2], 16);
        const startDst = parseInt(m[3], 16);
        const padLen = m[1].length;

        if (!isNaN(startSrc) && !isNaN(endSrc) && !isNaN(startDst) && endSrc >= startSrc && (endSrc - startSrc) < 1000) {
          for (let c = startSrc; c <= endSrc; c++) {
            const srcHex = c.toString(16).padStart(padLen, '0').toLowerCase();
            const dstChar = String.fromCharCode(startDst + (c - startSrc));
            cmapTable[srcHex] = dstChar;
          }
        }
      }
    },

    /**
     * Extracts text from inside BT ... ET content blocks using CMap
     */
    extractTextFromContentStream(streamContent, cmapTable, targetArray) {
      // Extract only content inside BT ... ET blocks
      const btRegex = /BT([\s\S]*?)ET/g;
      let btMatch;

      while ((btMatch = btRegex.exec(streamContent)) !== null) {
        const block = btMatch[1];

        // 1. Array text operator: [(part1) -200 (part2)] TJ or [<0001> 50 <0002>] TJ
        const tjArrayRegex = /\[([\s\S]*?)\]\s*TJ/g;
        let arrMatch;
        while ((arrMatch = tjArrayRegex.exec(block)) !== null) {
          const inner = arrMatch[1];
          let blockStr = '';

          // Match string chunks and negative spacing
          const chunkRegex = /\((.*?)\)|<([0-9a-fA-F]+)>|(-?\d+(?:\.\d+)?)/g;
          let cm;
          while ((cm = chunkRegex.exec(inner)) !== null) {
            if (cm[1] !== undefined) {
              // Literal string chunk
              blockStr += this.decodeLiteralPdfString(cm[1], cmapTable);
            } else if (cm[2] !== undefined) {
              // Hex string chunk
              blockStr += this.decodeHexPdfStringWithCMap(cm[2], cmapTable);
            } else if (cm[3] !== undefined) {
              // Kerning/displacement: if large negative number, represents a word space
              const disp = parseFloat(cm[3]);
              if (disp < -160 && !blockStr.endsWith(' ')) {
                blockStr += ' ';
              }
            }
          }

          if (blockStr.trim().length > 0) {
            targetArray.push(blockStr.trim());
          }
        }

        // 2. Standalone text operator: (text) Tj or ' or "
        const singleTjRegex = /\((.*?)\)\s*(?:Tj|'|")/g;
        let singleMatch;
        while ((singleMatch = singleTjRegex.exec(block)) !== null) {
          const decoded = this.decodeLiteralPdfString(singleMatch[1], cmapTable).trim();
          if (decoded.length > 0 && !targetArray.includes(decoded)) {
            targetArray.push(decoded);
          }
        }

        // 3. Standalone hex operator: <00410042> Tj
        const singleHexRegex = /<([0-9a-fA-F]+)>\s*(?:Tj|'|")/g;
        let hexMatch;
        while ((hexMatch = singleHexRegex.exec(block)) !== null) {
          const decoded = this.decodeHexPdfStringWithCMap(hexMatch[1], cmapTable).trim();
          if (decoded.length > 0 && !targetArray.includes(decoded)) {
            targetArray.push(decoded);
          }
        }
      }
    },

    decodeLiteralPdfString(rawStr, cmapTable) {
      let result = '';
      let i = 0;
      while (i < rawStr.length) {
        if (rawStr[i] === '\\' && i + 1 < rawStr.length) {
          const next = rawStr[i + 1];
          if (next === 'n') { result += ' '; i += 2; }
          else if (next === 'r') { result += ' '; i += 2; }
          else if (next === 't') { result += ' '; i += 2; }
          else if (next === '(' || next === ')' || next === '\\') { result += next; i += 2; }
          else if (/[0-7]/.test(next)) {
            // Octal escape \ddd
            const octalMatch = rawStr.substr(i + 1, 3).match(/^[0-7]{1,3}/);
            if (octalMatch) {
              const code = parseInt(octalMatch[0], 8);
              const hex1 = code.toString(16).padStart(2, '0').toLowerCase();
              result += cmapTable[hex1] || (code >= 32 && code <= 126 ? String.fromCharCode(code) : ' ');
              i += 1 + octalMatch[0].length;
            } else {
              i += 2;
            }
          } else {
            result += next;
            i += 2;
          }
        } else {
          const char = rawStr[i];
          const code = char.charCodeAt(0);
          const hex = code.toString(16).padStart(2, '0').toLowerCase();
          if (cmapTable[hex]) {
            result += cmapTable[hex];
          } else if (code >= 32 && code <= 126) {
            result += char;
          } else {
            result += ' ';
          }
          i++;
        }
      }
      return result;
    },

    decodeHexPdfStringWithCMap(hex, cmapTable) {
      let result = '';
      const hLower = hex.toLowerCase();

      // Check 4-character chunks first (typical 16-bit CID fonts)
      if (hLower.length % 4 === 0 && hLower.length >= 4) {
        let allFound = true;
        let candidate = '';
        for (let i = 0; i < hLower.length; i += 4) {
          const chunk = hLower.substr(i, 4);
          if (cmapTable[chunk]) {
            candidate += cmapTable[chunk];
          } else {
            allFound = false;
            break;
          }
        }
        if (allFound && candidate.length > 0) {
          return candidate;
        }
      }

      // Check 2-character chunks
      if (hLower.length % 2 === 0) {
        let candidate = '';
        for (let i = 0; i < hLower.length; i += 2) {
          const chunk = hLower.substr(i, 2);
          if (cmapTable[chunk]) {
            candidate += cmapTable[chunk];
          } else {
            const code = parseInt(chunk, 16);
            if (code >= 32 && code <= 126) {
              candidate += String.fromCharCode(code);
            } else if (code === 10 || code === 13) {
              candidate += ' ';
            }
          }
        }
        if (candidate.trim().length > 0) {
          return candidate;
        }
      }

      return this.decodeHexPdfString(hex);
    },

    decodeHexPdfString(hex) {
      let decoded = '';
      if (!hex || hex.length < 2) return '';
      // Check UTF-16BE (starts with FEFF or alternate 00 bytes)
      if (hex.startsWith('feff') || hex.startsWith('FEFF') || (hex.length >= 4 && hex.slice(0, 2) === '00')) {
        for (let i = 0; i < hex.length; i += 4) {
          const code = parseInt(hex.substr(i, 4), 16);
          if (code >= 32 && code <= 126) decoded += String.fromCharCode(code);
          else if (code === 10 || code === 13) decoded += ' ';
        }
      } else {
        for (let i = 0; i < hex.length; i += 2) {
          const code = parseInt(hex.substr(i, 2), 16);
          if (code >= 32 && code <= 126) decoded += String.fromCharCode(code);
          else if (code === 10 || code === 13) decoded += ' ';
        }
      }
      return decoded;
    },

    /**
     * Assesses whether the extracted text is readable English/Latin text
     * or garbled unmapped glyph IDs (common in certain subsetted PDFs).
     */
    checkTextQuality(text) {
      if (!text || text.trim().length === 0) {
        return {
          isGibberish: true,
          reason: 'No selectable text layer found in this PDF. It may be a scanned image or photocopy without OCR.'
        };
      }

      const trimmed = text.trim();
      const alphaMatches = trimmed.match(/[a-zA-Z0-9]/g);
      const alphaCount = alphaMatches ? alphaMatches.length : 0;
      const alphaRatio = alphaCount / trimmed.length;

      const words = trimmed.split(/\s+/);
      const validWords = words.filter(w => /^[a-zA-Z]{2,20}[.,;:?!]?$/.test(w));
      const wordRatio = validWords.length / Math.max(1, words.length);

      // Flag if less than 50% alphanumeric characters or fewer than 30% recognizable words
      if (alphaRatio < 0.50 || (words.length >= 6 && wordRatio < 0.28)) {
        return {
          isGibberish: true,
          reason: 'This PDF uses custom font glyph subsetting without standard Unicode mapping. The extracted text is garbled.'
        };
      }

      return { isGibberish: false, reason: null };
    },

    /**
     * Pure Vanilla JS DOCX Text Extractor
     * Minimal in-browser ZIP unpacker for word/document.xml with DecompressionStream.
     */
    async parseDOCX(file) {
      const buffer = await this.readAsArrayBuffer(file);
      const dataView = new DataView(buffer);
      const uint8 = new Uint8Array(buffer);

      let offset = 0;
      let documentXmlText = null;

      // Scan local file headers: signature 0x04034b50 (PK\x03\x04)
      while (offset < buffer.byteLength - 30) {
        const sig = dataView.getUint32(offset, true);
        if (sig !== 0x04034b50) {
          offset++;
          continue;
        }

        const compMethod = dataView.getUint16(offset + 8, true);
        const compSize = dataView.getUint32(offset + 18, true);
        const fileNameLen = dataView.getUint16(offset + 26, true);
        const extraLen = dataView.getUint16(offset + 28, true);

        const fileNameBytes = uint8.subarray(offset + 30, offset + 30 + fileNameLen);
        const fileName = new TextDecoder('utf-8').decode(fileNameBytes);
        const dataOffset = offset + 30 + fileNameLen + extraLen;

        const normName = fileName.replace(/\\/g, '/').toLowerCase();
        if (normName === 'word/document.xml' || normName.endsWith('/document.xml') || normName === 'document.xml') {
          // If compSize is 0, attempt to find next header or read remaining
          const actualCompSize = compSize > 0 ? compSize : Math.min(buffer.byteLength - dataOffset, 2000000);
          const compressedData = uint8.subarray(dataOffset, dataOffset + actualCompSize);

          if (compMethod === 0) {
            // Stored uncompressed
            documentXmlText = new TextDecoder('utf-8').decode(compressedData);
          } else if (compMethod === 8) {
            // Deflated
            if (typeof DecompressionStream !== 'undefined') {
              try {
                const ds = new DecompressionStream('deflate-raw');
                const stream = new Response(compressedData).body.pipeThrough(ds);
                const decompressed = await new Response(stream).arrayBuffer();
                documentXmlText = new TextDecoder('utf-8').decode(decompressed);
              } catch (e) {
                // Try standard deflate
                try {
                  const ds = new DecompressionStream('deflate');
                  const stream = new Response(compressedData).body.pipeThrough(ds);
                  const decompressed = await new Response(stream).arrayBuffer();
                  documentXmlText = new TextDecoder('utf-8').decode(decompressed);
                } catch (e2) {
                  console.warn('DOCX deflate extraction failed:', e2);
                }
              }
            }
          }
          break;
        }

        offset = dataOffset + (compSize > 0 ? compSize : 1);
      }

      // Fallback: If documentXmlText was not decoded, scan buffer for XML string
      if (!documentXmlText) {
        const fullAscii = new TextDecoder('latin1').decode(uint8);
        const xmlMatch = fullAscii.match(/<w:document[\s\S]*?<\/w:document>/);
        if (xmlMatch) {
          documentXmlText = xmlMatch[0];
        }
      }

      if (!documentXmlText) {
        throw new Error('Could not extract text from this DOCX file. Please copy and paste your text manually.');
      }

      // Parse XML document nodes
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(documentXmlText, 'application/xml');
      const paragraphs = xmlDoc.getElementsByTagName('w:p');
      const textPieces = [];

      for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        const texts = p.getElementsByTagName('w:t');
        let line = '';
        for (let j = 0; j < texts.length; j++) {
          line += texts[j].textContent;
        }
        if (line.trim()) {
          textPieces.push(line.trim());
        }
      }

      const fullText = textPieces.join('\n\n');
      return { text: fullText, warning: null };
    }
  };

  /* ==========================================================================
     5. QUESTION GENERATOR
     Deterministic, rule-based active-recall heuristic generation pipeline.
     ========================================================================== */
  const QuestionGenerator = {
    // Definitional markers indicating core conceptual definitions
    DEFINITIONAL_PATTERNS: [
      /\b(is|are)\s+(a|an|the)\b/i,
      /\brefers to\b/i,
      /\bdefined as\b/i,
      /\bmeans that\b/i,
      /\bmeans\b/i,
      /\bconsists of\b/i,
      /\boccurs when\b/i,
      /\bfunctions as\b/i,
      /\bplays a crucial role in\b/i,
      /\bserves to\b/i
    ],

    // Causal and mechanism connectors
    CAUSAL_PATTERNS: [
      /\bbecause\b/i,
      /\btherefore\b/i,
      /\bthus\b/i,
      /\bleads to\b/i,
      /\bresults in\b/i,
      /\bas a result\b/i,
      /\bcauses\b/i,
      /\benables\b/i,
      /\bconsequently\b/i
    ],

    // Transitional phrases to penalize
    TRANSITIONAL_PATTERNS: [
      /\bin this chapter\b/i,
      /\bin this section\b/i,
      /\bwe will discuss\b/i,
      /\bas mentioned earlier\b/i,
      /\bfor instance\b/i,
      /\blet us consider\b/i,
      /\bin summary\b/i,
      /\bas shown in\b/i
    ],

    // Antonym / polarity word pairs for semantic distractor mutation
    ANTONYM_PAIRS: [
      ['increases', 'decreases'],
      ['increased', 'decreased'],
      ['increasing', 'decreasing'],
      ['accelerates', 'decelerates'],
      ['promotes', 'inhibits'],
      ['aerobic', 'anaerobic'],
      ['primary', 'secondary'],
      ['internal', 'external'],
      ['exogenous', 'endogenous'],
      ['synthesizes', 'degrades'],
      ['positive', 'negative'],
      ['active', 'passive'],
      ['direct', 'indirect'],
      ['higher', 'lower'],
      ['maximum', 'minimum'],
      ['always', 'never'],
      ['rapidly', 'slowly'],
      ['efficient', 'inefficient'],
      ['soluble', 'insoluble'],
      ['stimulates', 'suppresses']
    ],

    /**
     * Main Generation Pipeline
     */
    generate(sourceText, config) {
      if (!sourceText || sourceText.trim().length < 200) {
        throw new Error('Source text must have at least 200 characters.');
      }

      // Step 1: Sentence segmentation
      const sentences = this.segmentSentences(sourceText);
      if (sentences.length === 0) {
        throw new Error('Could not parse suitable sentences from source material. Please provide text with complete sentences.');
      }

      // Step 2: Candidate sentence scoring
      const scoredSentences = sentences
        .map(s => ({ text: s, score: this.scoreSentence(s) }))
        .sort((a, b) => b.score - a.score);

      // Collect pool of salient entities across the whole document for distractors
      const globalEntityPool = this.collectDocumentEntities(sourceText);

      // Step 3 & 4: Build MCQs
      const targetCount = Math.max(3, Math.min(10, parseInt(config.count, 10) || 5));
      const questions = [];

      for (const item of scoredSentences) {
        if (questions.length >= targetCount) break;

        const q = this.buildMCQ(item.text, globalEntityPool, config);
        if (q && this.passesQualityGate(q)) {
          questions.push(q);
        }
      }

      // If we couldn't make targetCount, relax gate and retry
      if (questions.length < targetCount) {
        for (const item of scoredSentences) {
          if (questions.length >= targetCount) break;
          const exists = questions.some(q => q.originalSentence === item.text);
          if (!exists) {
            const q = this.buildMCQ(item.text, globalEntityPool, config, true);
            if (q) questions.push(q);
          }
        }
      }

      return {
        questions,
        totalGenerated: questions.length,
        requestedCount: targetCount,
        warning: questions.length < targetCount
          ? `Source is short — only ${questions.length} questions generated.`
          : null
      };
    },

    /**
     * Step 1: Segmentation with abbreviation and formatting awareness
     */
    segmentSentences(text) {
      if (!text) return [];

      // Clean markdown formatting: headers, bold, bullets, list numbers
      let cleaned = text
        .replace(/^[#*>-]+\s+/gm, '')
        .replace(/^\s*\d+[\.\)]\s+/gm, '')
        .replace(/^\s*[•\-\*]\s+/gm, '')
        .replace(/[*_~`]/g, '')
        .replace(/e\.g\./gi, '__EG__')
        .replace(/i\.e\./gi, '__IE__')
        .replace(/Dr\./g, '__DR__')
        .replace(/Mr\./g, '__MR__')
        .replace(/Ms\./g, '__MS__')
        .replace(/Prof\./g, '__PROF__')
        .replace(/vs\./gi, '__VS__')
        .replace(/Fig\./gi, '__FIG__')
        .replace(/al\./gi, '__AL__')
        .replace(/(\d+)\.(\d+)/g, '$1__DEC__$2'); // decimal numbers

      // Split on sentence terminals or line breaks
      const rawChunks = cleaned.split(/(?<=[.?!;])\s+|\n{1,}/);

      const sentences = [];
      for (let chunk of rawChunks) {
        let s = chunk
          .replace(/__EG__/g, 'e.g.')
          .replace(/__IE__/g, 'i.e.')
          .replace(/__DR__/g, 'Dr.')
          .replace(/__MR__/g, 'Mr.')
          .replace(/__MS__/g, 'Ms.')
          .replace(/__PROF__/g, 'Prof.')
          .replace(/__VS__/g, 'vs.')
          .replace(/__FIG__/g, 'Fig.')
          .replace(/__AL__/g, 'al.')
          .replace(/__DEC__/g, '.')
          .replace(/\s+/g, ' ')
          .trim();

        const words = s.split(/\s+/);
        // Allow sentences with 4 to 50 words and 20 to 450 characters
        if (words.length >= 4 && words.length <= 50 && s.length >= 20 && s.length <= 450) {
          sentences.push(s);
        }
      }

      // Fallback: If strict length filtering got fewer than 3 sentences, accept lines >= 15 chars
      if (sentences.length < 3) {
        for (let chunk of rawChunks) {
          let s = chunk.replace(/\s+/g, ' ').trim();
          if (s.length >= 15 && s.split(/\s+/).length >= 3 && !sentences.includes(s)) {
            sentences.push(s);
          }
        }
      }

      return sentences;
    },

    /**
     * Step 2: Salience Scoring
     */
    scoreSentence(sentence) {
      let score = 0;

      // Length factor
      const len = sentence.length;
      if (len >= 50 && len <= 250) score += 20;

      // Definitional markers (+45 pts)
      for (const pat of this.DEFINITIONAL_PATTERNS) {
        if (pat.test(sentence)) {
          score += 45;
          break;
        }
      }

      // Causal connectors (+35 pts)
      for (const pat of this.CAUSAL_PATTERNS) {
        if (pat.test(sentence)) {
          score += 35;
          break;
        }
      }

      // Numeric facts (+25 pts)
      if (/\b\d+(\.\d+)?\b/.test(sentence)) {
        score += 25;
      }

      // Capitalized multi-word noun phrase / entity (+25 pts)
      if (/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/.test(sentence)) {
        score += 25;
      }

      // Penalize transitional sentences (-50 pts)
      for (const pat of this.TRANSITIONAL_PATTERNS) {
        if (pat.test(sentence)) {
          score -= 50;
          break;
        }
      }

      return score;
    },

    /**
     * Collects technical terms / entities across the document for realistic distractors
     */
    collectDocumentEntities(fullText) {
      const entities = new Set();

      // Multi-word proper nouns
      const multiWordRegex = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g;
      let m;
      while ((m = multiWordRegex.exec(fullText)) !== null) {
        const ent = m[0].trim();
        if (ent.length > 3 && !['In This', 'As We', 'According To', 'There Are', 'It Is'].includes(ent)) {
          entities.add(ent);
        }
      }

      // Technical capitalized single nouns
      const singleNounRegex = /\b[A-Z][a-z]{3,}\b/g;
      while ((m = singleNounRegex.exec(fullText)) !== null) {
        const ent = m[0].trim();
        if (!['This', 'That', 'These', 'Those', 'Which', 'When', 'What', 'Where', 'Their', 'There', 'Also'].includes(ent)) {
          entities.add(ent);
        }
      }

      return Array.from(entities);
    },

    escapeRegex(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },

    /**
     * Step 3 & 4: Build MCQ, Extract Blank, Generate Distractors
     */
    buildMCQ(sentence, globalEntities, config, isFallback = false) {
      let keyPhrase = null;
      let stem = '';

      // 1. Check for Definitional Pattern: [Subject] is a/the/defined as [Definition]
      const defMatch = sentence.match(/^([^,;:]+?)\s+(?:is|are|refers to|is defined as|means|consists of|functions as)\s+(?:a|an|the)?\s*(.+)$/i);
      if (defMatch && defMatch[1].split(' ').length <= 6) {
        keyPhrase = defMatch[1].trim();
        // Mask any appearance of keyPhrase in definition to prevent giveaway
        const safeDef = defMatch[2].replace(new RegExp('\\b' + this.escapeRegex(keyPhrase) + '\\b', 'gi'), '____________');
        stem = `According to the source, what is defined as: "${safeDef}"?`;
      }

      // 2. If not standard definition, find prominent capitalized entity
      if (!keyPhrase) {
        const entityMatch = sentence.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/);
        if (entityMatch && entityMatch[0].length > 3 && !['The', 'This', 'These', 'When', 'What', 'According', 'Where', 'Which', 'There'].includes(entityMatch[0])) {
          keyPhrase = entityMatch[0];
          const masked = sentence.replace(new RegExp('\\b' + this.escapeRegex(keyPhrase) + '\\b', 'g'), '____________');
          stem = `According to the source, complete the statement: "${masked}"`;
        }
      }

      // 3. If still no entity, find numeric fact or core predicate
      if (!keyPhrase) {
        const numMatch = sentence.match(/\b\d+(?:\.\d+)?(?:\s*%|\s*units|\s*molecules|\s*years|\s*degrees)?\b/);
        if (numMatch) {
          keyPhrase = numMatch[0];
          const masked = sentence.replace(numMatch[0], '____________');
          stem = `According to the source, complete the statement: "${masked}"`;
        }
      }

      // 4. Fallback: masked first 2-3 content words
      if (!keyPhrase) {
        const words = sentence.split(' ');
        if (words.length >= 4) {
          keyPhrase = words.slice(0, 2).join(' ');
          stem = `According to the source, ____________ ${words.slice(2).join(' ')}`;
        } else {
          return null;
        }
      }

      const correctAnswer = keyPhrase.trim();

      // Generate 3 High-Quality Distractors
      const distractors = this.generateDistractors(correctAnswer, sentence, globalEntities);
      if (distractors.length < 3) {
        return null;
      }

      // Shuffle options randomly (A, B, C, D)
      const rawOptions = [
        { text: correctAnswer, isCorrect: true },
        { text: distractors[0], isCorrect: false },
        { text: distractors[1], isCorrect: false },
        { text: distractors[2], isCorrect: false }
      ];

      const options = this.shuffleArray(rawOptions);
      const correctIndex = options.findIndex(o => o.isCorrect);

      const topicTag = this.extractTopicTag(keyPhrase, sentence);
      const difficultyTag = config.difficulty || 'Intermediate';

      return {
        id: 'q_' + Math.random().toString(36).substr(2, 9),
        stem,
        options: options.map(o => o.text),
        correctIndex,
        whyCorrect: `According to the source text: "${sentence}"`,
        commonMisconception: `While plausible in similar contexts, options like "${distractors[0]}" do not satisfy the exact relationship described in the source material.`,
        memoryHook: `${topicTag} ↔ ${keyPhrase}`,
        topic: topicTag,
        difficulty: difficultyTag,
        originalSentence: sentence,
        correctAnswerText: correctAnswer
      };
    },

    /**
     * Generates 3 distractors using semantic rules & document entities
     */
    generateDistractors(correctAnswer, originalSentence, globalEntities) {
      const distractors = new Set();
      const lowerAns = correctAnswer.toLowerCase();

      // Rule 1: Antonym / Polarity word flip if answer contains contrasting word
      for (const [pos, neg] of this.ANTONYM_PAIRS) {
        if (lowerAns.includes(pos)) {
          const flipped = correctAnswer.replace(new RegExp(pos, 'gi'), neg);
          if (flipped.toLowerCase() !== lowerAns) distractors.add(flipped);
        } else if (lowerAns.includes(neg)) {
          const flipped = correctAnswer.replace(new RegExp(neg, 'gi'), pos);
          if (flipped.toLowerCase() !== lowerAns) distractors.add(flipped);
        }
      }

      // Rule 2: Numeric perturbation
      const numMatch = correctAnswer.match(/\b\d+(\.\d+)?\b/);
      if (numMatch) {
        const val = parseFloat(numMatch[0]);
        if (!isNaN(val)) {
          const p1 = correctAnswer.replace(numMatch[0], String(Math.round(val * 1.5 * 10) / 10));
          const p2 = correctAnswer.replace(numMatch[0], String(Math.round(val * 0.5 * 10) / 10));
          const p3 = correctAnswer.replace(numMatch[0], String(val + 10));
          if (p1 !== correctAnswer) distractors.add(p1);
          if (p2 !== correctAnswer) distractors.add(p2);
          if (p3 !== correctAnswer) distractors.add(p3);
        }
      }

      // Rule 3: Pull other entities from the same document
      const targetLen = correctAnswer.length;
      for (const entity of globalEntities) {
        if (distractors.size >= 3) break;
        const eLower = entity.toLowerCase();
        if (eLower !== lowerAns && !lowerAns.includes(eLower) && !eLower.includes(lowerAns)) {
          const diff = Math.abs(entity.length - targetLen);
          if (diff <= targetLen * 0.9 + 8) {
            distractors.add(entity);
          }
        }
      }

      // Rule 4: Domain modifier contrast fallbacks (guarantees at least 3 distractors)
      const prefixes = ['Secondary', 'Inverse', 'Partial', 'Autonomous', 'Exogenous', 'Alternative', 'Inactivated'];
      for (const prefix of prefixes) {
        if (distractors.size >= 3) break;
        const candidate = `${prefix} ${correctAnswer}`;
        if (!distractors.has(candidate) && candidate.toLowerCase() !== lowerAns) {
          distractors.add(candidate);
        }
      }

      return Array.from(distractors).slice(0, 3);
    },

    /**
     * Step 5: Quality Gate
     */
    passesQualityGate(q) {
      if (!q.stem || q.stem.split(' ').length < 4) return false;
      if (!q.options || q.options.length !== 4) return false;

      // Unique options check
      const uniqueOpts = new Set(q.options.map(o => o.toLowerCase().trim()));
      if (uniqueOpts.size !== 4) return false;

      // Stem must not contain the exact correct answer verbatim without being blanked
      const correctStr = q.options[q.correctIndex].toLowerCase();
      const stemLower = q.stem.toLowerCase();
      if (stemLower.includes(correctStr) && !q.stem.includes('____________')) {
        return false;
      }

      return true;
    },

    extractTopicTag(keyPhrase, sentence) {
      if (keyPhrase && keyPhrase.length > 2) {
        return keyPhrase.split(' ').slice(0, 2).join(' ').toUpperCase();
      }
      return 'CORE CONCEPT';
    },

    shuffleArray(arr) {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    }
  };

  /* ==========================================================================
     6. SAMPLE STUDY MATERIALS
     Quick-load curated texts for instant testing.
     ========================================================================== */
  const SAMPLE_TEXTS = {
    biology: `Cellular respiration is a metabolic pathway that breaks down glucose and produces adenosine triphosphate (ATP). The stages of cellular respiration include glycolysis, pyruvate oxidation, the citric acid cycle or Krebs cycle, and oxidative phosphorylation. Glycolysis occurs in the cytosol of the cell and does not require oxygen, meaning it is an anaerobic process. During glycolysis, a six-carbon glucose molecule is converted into two three-carbon pyruvate molecules, yielding a net gain of two ATP molecules and two NADH molecules. Pyruvate oxidation transitions the products into the mitochondria, converting pyruvate into acetyl-CoA while releasing carbon dioxide. The Krebs cycle takes place within the mitochondrial matrix and systematically harvests electrons by oxidizing acetyl-CoA. Oxidative phosphorylation occurs along the inner mitochondrial membrane and generates approximately thirty to thirty-two ATP molecules per glucose molecule via the electron transport chain. ATP synthase functions as a molecular rotary motor powered by an electrochemical proton gradient across the inner membrane. Because oxygen acts as the final electron acceptor in the electron transport chain, cellular respiration yields significantly more energy than anaerobic fermentation.`,

    cs: `Virtual memory is an operating system memory management capability that provides an idealized abstraction of storage resources available to a process. The memory management unit (MMU) is the hardware component responsible for translating virtual addresses into physical addresses at runtime. Paging is the standard memory allocation scheme where physical memory is partitioned into fixed-size contiguous blocks called page frames. The page table is a per-process data structure that stores the mapping between virtual pages and physical frames. A page fault occurs when a program accesses a page mapped in the virtual address space but not currently resident in physical memory. When a page fault is triggered, the operating system kernel intercepts the trap and loads the required page from secondary disk storage into physical RAM. The translation lookaside buffer (TLB) is a high-speed hardware associative cache that stores recent virtual-to-physical address translations to accelerate lookup times. Thrashing occurs when an operating system spends substantially more time swapping pages in and out of secondary storage than executing active instructions. Consequently, maintaining a high TLB hit ratio is critical for high-performance computing systems.`,

    economics: `Inflation is defined as the general and sustained increase in the overall price level of goods and services in an economy over time. When inflation increases, each unit of currency buys fewer goods, representing a decrease in purchasing power. The Consumer Price Index (CPI) is the primary statistical measure used by central banks to track the price change of a representative market basket of consumer goods and services. Demand-pull inflation occurs when aggregate demand for goods and services outpaces aggregate supply in an expanding economy. Cost-push inflation results from an aggregate decrease in supply caused by rising production costs, such as surging raw material prices or escalating wages. The Federal Reserve and other central banks utilize monetary policy to stabilize prices by adjusting the target interest rate. When a central bank raises interest rates, borrowing becomes more expensive, which slows consumer spending and reduces inflationary pressure. Conversely, lowering interest rates stimulates capital investment and consumer credit during economic downturns.`
  };

  /* ==========================================================================
     7. QUIZ ENGINE
     Manages the turn-by-turn state machine: SETUP -> QUESTION -> FEEDBACK -> RESULTS.
     ========================================================================== */
  const QuizEngine = {
    state: {
      screen: 'SETUP', // 'SETUP' | 'QUIZ' | 'RESULTS'
      questions: [],
      currentIndex: 0,
      userAnswers: [], // { questionIndex, selectedIndex, isCorrect, timeMs, ratingBefore, ratingAfter }
      score: 0,
      currentStreak: 0,
      maxStreak: 0,
      playerRating: 1000,
      ratingHistory: [1000],
      startTime: null,
      questionStartTime: null,
      subject: '',
      level: '',
      stream: '',
      difficulty: '',
      isTurnLocked: false
    },

    init() {
      // Check for saved in-progress state
      const saved = StorageManager.loadState();
      if (saved && saved.screen === 'QUIZ' && saved.questions && saved.questions.length > 0) {
        UIManager.showResumeModal(saved);
      } else {
        UIManager.showScreen('SETUP');
      }
    },

    startQuiz(questions, config) {
      this.state = {
        screen: 'QUIZ',
        questions,
        currentIndex: 0,
        userAnswers: [],
        score: 0,
        currentStreak: 0,
        maxStreak: 0,
        playerRating: 1000,
        ratingHistory: [1000],
        startTime: Date.now(),
        questionStartTime: Date.now(),
        subject: config.subject,
        level: config.level,
        stream: config.stream,
        difficulty: config.difficulty,
        isTurnLocked: false
      };

      StorageManager.saveState(this.state);
      UIManager.renderQuizScreen();
    },

    resumeQuiz(savedState) {
      this.state = savedState;
      this.state.questionStartTime = Date.now();
      UIManager.renderQuizScreen();
    },

    submitAnswer(selectedIndex) {
      if (this.state.isTurnLocked) return;

      const q = this.state.questions[this.state.currentIndex];
      const isCorrect = selectedIndex === q.correctIndex;
      const elapsedMs = Date.now() - (this.state.questionStartTime || Date.now());

      this.state.isTurnLocked = true;

      // Update score and streak
      if (isCorrect) {
        this.state.score += 1;
        this.state.currentStreak += 1;
        if (this.state.currentStreak > this.state.maxStreak) {
          this.state.maxStreak = this.state.currentStreak;
        }
        SoundEngine.playCorrect();
      } else {
        this.state.currentStreak = 0;
        SoundEngine.playWrong();

        // Add to Mistake Bank
        StorageManager.addMistake({
          id: q.id,
          stem: q.stem,
          options: q.options,
          correctIndex: q.correctIndex,
          whyCorrect: q.whyCorrect,
          commonMisconception: q.commonMisconception,
          memoryHook: q.memoryHook,
          topic: q.topic,
          difficulty: q.difficulty,
          timestamp: Date.now()
        });
        UIManager.updateMistakesBadge();
      }

      // Update Adaptive Rating
      const ratingBefore = this.state.playerRating;
      const ratingAfter = AdaptiveEngine.recordAnswer(
        ratingBefore,
        isCorrect,
        elapsedMs,
        this.state.currentStreak
      );
      this.state.playerRating = ratingAfter;
      this.state.ratingHistory.push(ratingAfter);

      // Record answer history
      this.state.userAnswers.push({
        questionIndex: this.state.currentIndex,
        selectedIndex,
        isCorrect,
        timeMs: elapsedMs,
        ratingBefore,
        ratingAfter
      });

      // Persist state to LocalStorage
      StorageManager.saveState(this.state);

      // Reveal visual feedback
      UIManager.revealFeedback(selectedIndex, q.correctIndex, isCorrect, q);
    },

    nextQuestion() {
      if (this.state.currentIndex + 1 < this.state.questions.length) {
        this.state.currentIndex += 1;
        this.state.isTurnLocked = false;
        this.state.questionStartTime = Date.now();
        StorageManager.saveState(this.state);
        UIManager.renderQuizScreen();
      } else {
        this.finishQuiz();
      }
    },

    finishQuiz() {
      this.state.screen = 'RESULTS';
      SoundEngine.playComplete();

      const total = this.state.questions.length;
      const score = this.state.score;
      const pct = Math.round((score / total) * 100);
      const totalTimeMs = Date.now() - (this.state.startTime || Date.now());
      const avgSpeedSec = (totalTimeMs / (total * 1000)).toFixed(1);
      const tier = AdaptiveEngine.getCurrentTier(this.state.playerRating);

      // Save to Quiz History
      const attemptRecord = {
        id: 'hist_' + Date.now(),
        timestamp: new Date().toISOString(),
        subject: this.state.subject || 'General Study',
        level: this.state.level,
        stream: this.state.stream,
        difficulty: this.state.difficulty,
        score,
        total,
        pct,
        avgSpeedSec,
        maxStreak: this.state.maxStreak,
        tierReached: tier.name
      };
      StorageManager.saveHistory(attemptRecord);

      // Clear in-progress session
      StorageManager.clearState();

      UIManager.renderResultsScreen(attemptRecord);
    },

    retakeQuiz() {
      // Re-shuffle options for each question
      const reshuffledQuestions = this.state.questions.map(q => {
        const correctText = q.options[q.correctIndex];
        const newOptions = QuestionGenerator.shuffleArray([...q.options]);
        return {
          ...q,
          options: newOptions,
          correctIndex: newOptions.indexOf(correctText)
        };
      });

      this.startQuiz(reshuffledQuestions, {
        subject: this.state.subject,
        level: this.state.level,
        stream: this.state.stream,
        difficulty: this.state.difficulty
      });
    }
  };

  /* ==========================================================================
     8. UI MANAGER
     Handles DOM manipulation, rendering, SVGs, modals, keyboard input, toasts.
     ========================================================================== */
  const UIManager = {
    elements: {},

    init() {
      this.cacheElements();
      this.bindEvents();
      this.applyTheme(StorageManager.getSettings().theme);
      this.updateMistakesBadge();
    },

    cacheElements() {
      this.elements = {
        // Screens
        screenSetup: document.getElementById('screen-setup'),
        screenQuiz: document.getElementById('screen-quiz'),
        screenResults: document.getElementById('screen-results'),

        // Header controls
        btnBrandHome: document.getElementById('btn-brand-home'),
        btnOpenMistakes: document.getElementById('btn-open-mistakes'),
        btnOpenHistory: document.getElementById('btn-open-history'),
        btnToggleSound: document.getElementById('btn-toggle-sound'),
        btnToggleTheme: document.getElementById('btn-toggle-theme'),
        soundIconOn: document.getElementById('sound-icon-on'),
        soundIconOff: document.getElementById('sound-icon-off'),
        themeIconSun: document.getElementById('theme-icon-sun'),
        themeIconMoon: document.getElementById('theme-icon-moon'),
        headerMistakesBadge: document.getElementById('header-mistakes-badge'),

        // Setup Form
        tabPaste: document.getElementById('tab-paste'),
        tabUpload: document.getElementById('tab-upload'),
        panelPaste: document.getElementById('panel-paste'),
        panelUpload: document.getElementById('panel-upload'),
        sourceText: document.getElementById('source-text'),
        charCountText: document.getElementById('char-count-text'),
        charValidityStatus: document.getElementById('char-validity-status'),
        dropzone: document.getElementById('dropzone'),
        fileInput: document.getElementById('file-input'),
        previewCard: document.getElementById('preview-card'),
        previewNoticeBox: document.getElementById('preview-notice-box'),
        previewText: document.getElementById('preview-text'),
        previewCountText: document.getElementById('preview-count-text'),
        btnConfirmPreview: document.getElementById('btn-confirm-preview'),
        btnGenerateFromPreview: document.getElementById('btn-generate-from-preview'),
        configLevel: document.getElementById('config-level'),
        configStream: document.getElementById('config-stream'),
        configDifficulty: document.getElementById('config-difficulty'),
        configCount: document.getElementById('config-count'),
        configSubject: document.getElementById('config-subject'),
        setupWarning: document.getElementById('setup-warning'),
        setupWarningMsg: document.getElementById('setup-warning-msg'),
        btnStartQuiz: document.getElementById('btn-start-quiz'),

        // Quiz Stage
        hudCurrent: document.getElementById('hud-current'),
        hudTotal: document.getElementById('hud-total'),
        hudScore: document.getElementById('hud-score'),
        hudAnswered: document.getElementById('hud-answered'),
        hudStreak: document.getElementById('hud-streak'),
        btnHudSound: document.getElementById('btn-hud-sound'),
        hudSoundIcon: document.getElementById('hud-sound-icon'),
        progressFill: document.getElementById('progress-fill'),
        tierChip: document.getElementById('tier-chip'),
        tierChipText: document.getElementById('tier-chip-text'),
        btnExitQuiz: document.getElementById('btn-exit-quiz'),
        questionTopic: document.getElementById('question-topic'),
        questionDifficulty: document.getElementById('question-difficulty'),
        questionStem: document.getElementById('question-stem'),
        optionsContainer: document.getElementById('options-container'),
        optBtns: [
          document.getElementById('opt-0'),
          document.getElementById('opt-1'),
          document.getElementById('opt-2'),
          document.getElementById('opt-3')
        ],
        optTexts: [
          document.getElementById('opt-text-0'),
          document.getElementById('opt-text-1'),
          document.getElementById('opt-text-2'),
          document.getElementById('opt-text-3')
        ],

        // Feedback Drawer
        feedbackDrawer: document.getElementById('feedback-drawer'),
        feedbackCard: document.getElementById('feedback-card'),
        feedbackVerdict: document.getElementById('feedback-verdict'),
        feedbackWhy: document.getElementById('feedback-why'),
        feedbackMisconception: document.getElementById('feedback-misconception'),
        feedbackHook: document.getElementById('feedback-hook'),
        btnNextQuestion: document.getElementById('btn-next-question'),
        btnNextText: document.getElementById('btn-next-text'),

        // Results Screen
        resultsScore: document.getElementById('results-score'),
        resultsPct: document.getElementById('results-pct'),
        resultsTitle: document.getElementById('results-title'),
        metricAccuracy: document.getElementById('metric-accuracy'),
        metricSpeed: document.getElementById('metric-speed'),
        metricStreak: document.getElementById('metric-streak'),
        metricTier: document.getElementById('metric-tier'),
        diagnosticTakeawayText: document.getElementById('diagnostic-takeaway-text'),
        radarChartContainer: document.getElementById('radar-chart-container'),
        masteryChartContainer: document.getElementById('mastery-chart-container'),
        resultsMistakesSection: document.getElementById('results-mistakes-section'),
        resultsMistakesList: document.getElementById('results-mistakes-list'),
        btnPracticeMistakesNow: document.getElementById('btn-practice-mistakes-now'),
        breakdownList: document.getElementById('breakdown-list'),
        btnRetakeQuiz: document.getElementById('btn-retake-quiz'),
        btnNewQuiz: document.getElementById('btn-new-quiz'),
        btnExportJson: document.getElementById('btn-export-json'),
        btnDownloadHtml: document.getElementById('btn-download-html'),

        // Modals
        modalResume: document.getElementById('modal-resume'),
        btnResumeDiscard: document.getElementById('btn-resume-discard'),
        btnResumeAccept: document.getElementById('btn-resume-accept'),
        modalMistakes: document.getElementById('modal-mistakes'),
        modalMistakesList: document.getElementById('modal-mistakes-list'),
        btnClearMistakes: document.getElementById('btn-clear-mistakes'),
        btnCloseMistakesModal: document.getElementById('btn-close-mistakes-modal'),
        btnLaunchMistakesQuiz: document.getElementById('btn-launch-mistakes-quiz'),
        modalHistory: document.getElementById('modal-history'),
        modalHistoryList: document.getElementById('modal-history-list'),
        btnClearHistory: document.getElementById('btn-clear-history'),
        btnCloseHistoryModal: document.getElementById('btn-close-history-modal'),
        modalConfirmExit: document.getElementById('modal-confirm-exit'),
        btnCancelExit: document.getElementById('btn-cancel-exit'),
        btnConfirmExitQuiz: document.getElementById('btn-confirm-exit-quiz'),

        toastContainer: document.getElementById('toast-container')
      };
      this.currentInputTab = 'paste';
    },

    bindEvents() {
      // Brand logo home click
      this.elements.btnBrandHome.addEventListener('click', () => {
        if (QuizEngine.state.screen === 'QUIZ') {
          this.showModal(this.elements.modalConfirmExit);
        } else {
          this.showScreen('SETUP');
        }
      });

      // Sound Toggle
      this.elements.btnToggleSound.addEventListener('click', () => this.toggleSound());
      this.elements.btnHudSound.addEventListener('click', () => this.toggleSound());

      // Theme Toggle
      this.elements.btnToggleTheme.addEventListener('click', () => this.toggleTheme());

      // Mode Tabs
      this.elements.tabPaste.addEventListener('click', () => this.switchInputTab('paste'));
      this.elements.tabUpload.addEventListener('click', () => this.switchInputTab('upload'));

      // Source Text input counter & validation
      this.elements.sourceText.addEventListener('input', () => {
        if (this.elements.previewText) {
          this.elements.previewText.value = this.elements.sourceText.value;
        }
        this.validateSetupForm();
      });

      // Sample text chip loaders
      document.querySelectorAll('.sample-chip').forEach(btn => {
        btn.addEventListener('click', e => {
          const sampleKey = e.target.dataset.sample;
          if (SAMPLE_TEXTS[sampleKey]) {
            this.elements.sourceText.value = SAMPLE_TEXTS[sampleKey];
            if (this.elements.previewText) {
              this.elements.previewText.value = SAMPLE_TEXTS[sampleKey];
            }
            this.switchInputTab('paste');
            this.validateSetupForm();
            this.showToast('Loaded sample text into editor', 'info');
            SoundEngine.playClick();
          }
        });
      });

      // Dropzone & File Input
      this.elements.dropzone.addEventListener('click', () => this.elements.fileInput.click());
      this.elements.dropzone.addEventListener('dragover', e => {
        e.preventDefault();
        this.elements.dropzone.classList.add('dragover');
      });
      this.elements.dropzone.addEventListener('dragleave', () => {
        this.elements.dropzone.classList.remove('dragover');
      });
      this.elements.dropzone.addEventListener('drop', async e => {
        e.preventDefault();
        this.elements.dropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          await this.handleFileUpload(e.dataTransfer.files[0]);
        }
      });
      this.elements.fileInput.addEventListener('change', async e => {
        if (e.target.files && e.target.files[0]) {
          await this.handleFileUpload(e.target.files[0]);
        }
      });

      // Preview edit & synchronization
      this.elements.previewText.addEventListener('input', () => {
        const text = this.elements.previewText.value;
        this.elements.sourceText.value = text;
        this.validateSetupForm();
      });

      this.elements.btnConfirmPreview.addEventListener('click', () => {
        const text = this.elements.previewText.value;
        this.elements.sourceText.value = text;
        this.switchInputTab('paste');
        this.validateSetupForm();
        this.showToast('Extracted text loaded into paste tab', 'success');
        SoundEngine.playClick();
      });

      // Quick Generate Button right in the preview card
      if (this.elements.btnGenerateFromPreview) {
        this.elements.btnGenerateFromPreview.addEventListener('click', () => {
          SoundEngine.playClick();
          this.handleStartQuiz();
        });
      }

      // Start Quiz button
      this.elements.btnStartQuiz.addEventListener('click', () => this.handleStartQuiz());

      // Quiz Answer options
      this.elements.optBtns.forEach((btn, idx) => {
        btn.addEventListener('click', () => {
          SoundEngine.playClick();
          QuizEngine.submitAnswer(idx);
        });
      });

      // Next Question Button
      this.elements.btnNextQuestion.addEventListener('click', () => {
        SoundEngine.playClick();
        QuizEngine.nextQuestion();
      });

      // Exit Quiz button
      this.elements.btnExitQuiz.addEventListener('click', () => {
        this.showModal(this.elements.modalConfirmExit);
      });
      this.elements.btnCancelExit.addEventListener('click', () => {
        this.hideModal(this.elements.modalConfirmExit);
      });
      this.elements.btnConfirmExitQuiz.addEventListener('click', () => {
        this.hideModal(this.elements.modalConfirmExit);
        this.showScreen('SETUP');
      });

      // Results Actions
      this.elements.btnRetakeQuiz.addEventListener('click', () => QuizEngine.retakeQuiz());
      this.elements.btnNewQuiz.addEventListener('click', () => this.showScreen('SETUP'));
      this.elements.btnExportJson.addEventListener('click', () => this.exportResultsJson());
      this.elements.btnDownloadHtml.addEventListener('click', () => this.downloadQuizHtml());
      this.elements.btnPracticeMistakesNow.addEventListener('click', () => this.launchMistakesQuiz());

      // Mistake Bank Modal
      this.elements.btnOpenMistakes.addEventListener('click', () => this.openMistakesModal());
      this.elements.btnCloseMistakesModal.addEventListener('click', () => this.hideModal(this.elements.modalMistakes));
      this.elements.btnClearMistakes.addEventListener('click', () => {
        StorageManager.clearMistakes();
        this.updateMistakesBadge();
        this.renderMistakesList();
        this.showToast('Mistake bank cleared', 'info');
      });
      this.elements.btnLaunchMistakesQuiz.addEventListener('click', () => this.launchMistakesQuiz());

      // History Modal
      this.elements.btnOpenHistory.addEventListener('click', () => this.openHistoryModal());
      this.elements.btnCloseHistoryModal.addEventListener('click', () => this.hideModal(this.elements.modalHistory));
      this.elements.btnClearHistory.addEventListener('click', () => {
        StorageManager.clearHistory();
        this.renderHistoryList();
        this.showToast('Attempt history cleared', 'info');
      });

      // Resume Modal
      this.elements.btnResumeDiscard.addEventListener('click', () => {
        StorageManager.clearState();
        this.hideModal(this.elements.modalResume);
        this.showScreen('SETUP');
      });

      // Global Keyboard Shortcuts
      window.addEventListener('keydown', e => this.handleKeyboardShortcut(e));
    },

    handleKeyboardShortcut(e) {
      // Don't trigger if user is typing in a textarea or input
      const tag = document.activeElement.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;

      // Quiz mode shortcuts
      if (QuizEngine.state.screen === 'QUIZ') {
        if (['1', '2', '3', '4'].includes(e.key)) {
          const idx = parseInt(e.key, 10) - 1;
          if (!QuizEngine.state.isTurnLocked && this.elements.optBtns[idx]) {
            this.elements.optBtns[idx].click();
          }
        } else if (e.key === 'Enter') {
          if (QuizEngine.state.isTurnLocked) {
            this.elements.btnNextQuestion.click();
          }
        } else if (e.key === 'Escape') {
          this.showModal(this.elements.modalConfirmExit);
        }
      }
    },

    showScreen(screenName) {
      QuizEngine.state.screen = screenName;
      this.elements.screenSetup.classList.remove('active');
      this.elements.screenQuiz.classList.remove('active');
      this.elements.screenResults.classList.remove('active');

      if (screenName === 'SETUP') {
        this.elements.screenSetup.classList.add('active');
        this.validateSetupForm();
      } else if (screenName === 'QUIZ') {
        this.elements.screenQuiz.classList.add('active');
      } else if (screenName === 'RESULTS') {
        this.elements.screenResults.classList.add('active');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    switchInputTab(tab) {
      this.currentInputTab = tab;
      if (tab === 'paste') {
        this.elements.tabPaste.classList.add('active');
        this.elements.tabUpload.classList.remove('active');
        this.elements.panelPaste.classList.add('active');
        this.elements.panelUpload.classList.remove('active');
      } else {
        this.elements.tabUpload.classList.add('active');
        this.elements.tabPaste.classList.remove('active');
        this.elements.panelUpload.classList.add('active');
        this.elements.panelPaste.classList.remove('active');
      }
      this.validateSetupForm();
      SoundEngine.playClick();
    },

    async handleFileUpload(file) {
      try {
        this.showToast(`Extracting ${file.name}...`, 'info');
        const result = await FileParser.parseFile(file);

        if (!result.text || result.text.trim().length === 0) {
          throw new Error('No readable text could be extracted from this file. If this is a scanned PDF or image, please copy and paste the text manually.');
        }

        // Handle case where PDF uses unmapped glyphs or custom font subsetting
        if (result.isGibberish) {
          this.elements.previewCard.style.display = 'block';
          this.elements.previewText.value = result.text;
          this.elements.sourceText.value = ''; // Do not sync gibberish to active source
          this.elements.previewCountText.textContent = `${result.text.length} characters (custom font glyphs detected)`;

          this.elements.previewNoticeBox.style.display = 'flex';
          this.elements.previewNoticeBox.innerHTML = `
            <div style="width:100%;">
              <div style="margin-bottom:6px;"><strong>⚠️ PDF Font Notice:</strong> ${result.warning}</div>
              <button type="button" id="btn-switch-to-paste-helper" class="btn-primary" style="width:auto; padding:4px 12px; font-size:0.82rem; background:var(--accent);">
                📋 Switch to 'Paste Text' Tab &amp; Paste Notes
              </button>
            </div>
          `;
          const helperBtn = document.getElementById('btn-switch-to-paste-helper');
          if (helperBtn) {
            helperBtn.onclick = () => {
              this.switchInputTab('paste');
              this.elements.sourceText.focus();
            };
          }

          this.validateSetupForm();
          this.showToast('PDF contains custom font glyphs. Please paste text directly for best results.', 'error');
          return;
        }

        this.elements.previewCard.style.display = 'block';
        this.elements.previewText.value = result.text;
        this.elements.sourceText.value = result.text; // Immediately sync to sourceText so quiz generation is ready!
        this.elements.previewCountText.textContent = `${result.text.length} characters`;

        // Auto-populate Subject Name from filename if default
        const rawFileName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
        if (this.elements.configSubject.value === 'Cellular Biology' || !this.elements.configSubject.value.trim()) {
          this.elements.configSubject.value = rawFileName.charAt(0).toUpperCase() + rawFileName.slice(1);
        }

        if (result.warning) {
          this.elements.previewNoticeBox.style.display = 'flex';
          this.elements.previewNoticeBox.innerHTML = `<span>⚠️ ${result.warning}</span>`;
        } else {
          this.elements.previewNoticeBox.style.display = 'none';
        }

        // Re-validate setup form immediately
        this.validateSetupForm();

        this.showToast(`Extracted ${result.text.length} characters. Ready to generate quiz!`, 'success');
      } catch (err) {
        this.showToast(`File error: ${err.message}`, 'error');
        if (this.elements.previewNoticeBox) {
          this.elements.previewCard.style.display = 'block';
          this.elements.previewNoticeBox.style.display = 'flex';
          this.elements.previewNoticeBox.innerHTML = `<span>⚠️ ${err.message}</span>`;
        }
      }
    },

    getActiveSourceText() {
      if (this.currentInputTab === 'upload') {
        const p = this.elements.previewText ? this.elements.previewText.value.trim() : '';
        const s = this.elements.sourceText ? this.elements.sourceText.value.trim() : '';
        return p || s;
      }
      const s = this.elements.sourceText ? this.elements.sourceText.value.trim() : '';
      const p = this.elements.previewText ? this.elements.previewText.value.trim() : '';
      return s || p;
    },

    validateSetupForm() {
      const activeText = this.getActiveSourceText();
      const len = activeText.length;
      this.elements.charCountText.textContent = `${len} / 200 min characters`;
      if (this.elements.previewCountText) {
        this.elements.previewCountText.textContent = `${len} characters`;
      }

      if (len >= 200) {
        this.elements.charValidityStatus.textContent = '✓ Ready to generate';
        this.elements.charValidityStatus.className = 'char-counter valid';
        this.elements.btnStartQuiz.disabled = false;
        if (this.elements.btnGenerateFromPreview) {
          this.elements.btnGenerateFromPreview.disabled = false;
        }
        if (this.elements.setupWarning) {
          this.elements.setupWarning.style.display = 'none';
        }
      } else {
        this.elements.charValidityStatus.textContent = `Need ${200 - len} more characters`;
        this.elements.charValidityStatus.className = 'char-counter invalid';
        this.elements.btnStartQuiz.disabled = true;
        if (this.elements.btnGenerateFromPreview) {
          this.elements.btnGenerateFromPreview.disabled = true;
        }
      }
    },

    handleStartQuiz() {
      const sourceText = this.getActiveSourceText();
      if (!sourceText || sourceText.length < 200) {
        this.elements.setupWarning.style.display = 'flex';
        this.elements.setupWarningMsg.textContent = `Source text needs at least 200 characters (currently ${sourceText ? sourceText.length : 0}).`;
        return;
      }

      const config = {
        level: this.elements.configLevel.value,
        stream: this.elements.configStream.value,
        difficulty: this.elements.configDifficulty.value,
        count: this.elements.configCount.value,
        subject: this.elements.configSubject.value.trim() || 'General Subject'
      };

      try {
        const result = QuestionGenerator.generate(sourceText, config);

        if (result.questions.length === 0) {
          this.elements.setupWarning.style.display = 'flex';
          this.elements.setupWarningMsg.textContent = 'Could not generate sufficient questions from this material. Please ensure the material contains complete factual or conceptual statements.';
          return;
        }

        if (result.warning) {
          this.elements.setupWarning.style.display = 'flex';
          this.elements.setupWarningMsg.textContent = result.warning;
        } else {
          this.elements.setupWarning.style.display = 'none';
        }

        QuizEngine.startQuiz(result.questions, config);
        this.showScreen('QUIZ');
      } catch (err) {
        this.elements.setupWarning.style.display = 'flex';
        this.elements.setupWarningMsg.textContent = err.message;
      }
    },

    renderQuizScreen() {
      const state = QuizEngine.state;
      const q = state.questions[state.currentIndex];
      const total = state.questions.length;

      // Update HUD
      this.elements.hudCurrent.textContent = state.currentIndex + 1;
      this.elements.hudTotal.textContent = total;
      this.elements.hudScore.textContent = state.score;
      this.elements.hudAnswered.textContent = state.currentIndex;
      this.elements.hudStreak.textContent = `🔥 ${state.currentStreak}`;

      // Progress bar fill
      const pct = (state.currentIndex / total) * 100;
      this.elements.progressFill.style.width = `${pct}%`;

      // Adaptive Tier Chip
      const tier = AdaptiveEngine.getCurrentTier(state.playerRating);
      this.elements.tierChip.className = `tier-chip ${tier.chipClass}`;
      this.elements.tierChipText.textContent = `Level ${tier.level} · ${tier.name}`;

      // Question metadata
      this.elements.questionTopic.textContent = q.topic || 'CONCEPT';
      this.elements.questionDifficulty.textContent = q.difficulty || state.difficulty;
      this.elements.questionStem.textContent = q.stem;

      // Reset options
      this.elements.optBtns.forEach((btn, idx) => {
        btn.disabled = false;
        btn.className = 'option-btn';
        this.elements.optTexts[idx].textContent = q.options[idx] || '';
      });

      // Reset feedback drawer
      this.elements.feedbackDrawer.classList.remove('open');
      this.elements.feedbackCard.className = 'feedback-card';

      // Next button text
      if (state.currentIndex + 1 === total) {
        this.elements.btnNextText.textContent = 'See Results';
      } else {
        this.elements.btnNextText.textContent = 'Next Question';
      }

      // Scroll to top of question card
      this.elements.questionStem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },

    revealFeedback(selectedIndex, correctIndex, isCorrect, q) {
      // Lock options
      this.elements.optBtns.forEach((btn, idx) => {
        btn.disabled = true;
        if (idx === correctIndex) {
          btn.classList.add('revealed-correct');
        } else if (idx === selectedIndex && !isCorrect) {
          btn.classList.add('selected-wrong');
        } else {
          btn.classList.add('dimmed');
        }
      });

      // Verdict line
      const optLetters = ['A', 'B', 'C', 'D'];
      const chosenLetter = optLetters[selectedIndex];
      const correctLetter = optLetters[correctIndex];

      if (isCorrect) {
        this.elements.feedbackVerdict.className = 'feedback-verdict correct';
        this.elements.feedbackVerdict.innerHTML = `<span>✅ CORRECT</span> <span>Choice: ${chosenLetter}</span>`;
        this.elements.feedbackCard.className = 'feedback-card correct-border';
      } else {
        this.elements.feedbackVerdict.className = 'feedback-verdict wrong';
        this.elements.feedbackVerdict.innerHTML = `<span>❌ WRONG</span> <span>Your: ${chosenLetter} &bull; Correct: ${correctLetter}</span>`;
        this.elements.feedbackCard.className = 'feedback-card wrong-border';
      }

      // Populate explanations securely via textContent
      this.elements.feedbackWhy.textContent = q.whyCorrect;
      this.elements.feedbackMisconception.textContent = q.commonMisconception;
      this.elements.feedbackHook.textContent = q.memoryHook;

      // Slide in drawer
      this.elements.feedbackDrawer.classList.add('open');

      // Focus Next Button
      setTimeout(() => {
        this.elements.btnNextQuestion.focus();
      }, 100);
    },

    renderResultsScreen(record) {
      this.showScreen('RESULTS');

      const state = QuizEngine.state;
      const total = state.questions.length;
      const score = state.score;
      const pct = Math.round((score / total) * 100);

      // Score and title
      this.elements.resultsScore.textContent = `${score}/${total}`;
      this.elements.resultsPct.textContent = `${pct}%`;

      if (pct >= 80) {
        this.elements.resultsTitle.textContent = 'Outstanding Mastery!';
      } else if (pct >= 60) {
        this.elements.resultsTitle.textContent = 'Solid Recall — Keep Reinforcing!';
      } else {
        this.elements.resultsTitle.textContent = 'Active-Recall Review Recommended';
      }

      // Metrics
      this.elements.metricAccuracy.textContent = `${pct}%`;
      this.elements.metricSpeed.textContent = `${record.avgSpeedSec}s`;
      this.elements.metricStreak.textContent = state.maxStreak;
      this.elements.metricTier.textContent = record.tierReached;

      // Weakest concept takeaway
      const missedAnswers = state.userAnswers.filter(a => !a.isCorrect);
      if (missedAnswers.length > 0) {
        const weakestQ = state.questions[missedAnswers[0].questionIndex];
        this.elements.diagnosticTakeawayText.textContent =
          `Primary focus area: "${weakestQ.topic}". You struggled on question #${missedAnswers[0].questionIndex + 1}. Active recall practice on this core definition will yield the highest retention gains.`;
      } else {
        this.elements.diagnosticTakeawayText.textContent =
          `Flawless run! You demonstrated 100% active-recall accuracy across all tested concepts. Consider advancing to higher difficulty material.`;
      }

      // Render pure SVG Charts
      this.renderRadarChart(pct, record.avgSpeedSec, state.maxStreak, total, state.playerRating);
      this.renderMasteryProgressionChart(state.ratingHistory);

      // Render Mistake Bank in results
      if (missedAnswers.length > 0) {
        this.elements.resultsMistakesSection.style.display = 'block';
        this.elements.resultsMistakesList.innerHTML = '';

        missedAnswers.forEach(ans => {
          const mq = state.questions[ans.questionIndex];
          const div = document.createElement('div');
          div.className = 'modal-list-item';
          div.innerHTML = `
            <div style="font-weight:700; color:var(--text); margin-bottom:2px;">${mq.stem}</div>
            <div style="color:var(--correct); font-size:0.82rem;">Correct: ${mq.options[mq.correctIndex]}</div>
          `;
          this.elements.resultsMistakesList.appendChild(div);
        });
      } else {
        this.elements.resultsMistakesSection.style.display = 'none';
      }

      // Per-Question Detailed Breakdown
      this.elements.breakdownList.innerHTML = '';
      state.userAnswers.forEach((ans, idx) => {
        const q = state.questions[ans.questionIndex];
        const item = document.createElement('div');
        item.className = 'breakdown-item';

        const optLetters = ['A', 'B', 'C', 'D'];
        const chosen = optLetters[ans.selectedIndex];
        const correct = optLetters[q.correctIndex];
        const statusBadge = ans.isCorrect
          ? '<span style="color:var(--correct);">✅ Correct</span>'
          : '<span style="color:var(--wrong);">❌ Wrong</span>';

        item.innerHTML = `
          <div class="breakdown-header">
            <span>Q${idx + 1} &bull; ${q.topic || 'CONCEPT'}</span>
            ${statusBadge}
          </div>
          <div class="breakdown-q-stem">${q.stem}</div>
          <div class="breakdown-answers">
            <span class="${ans.isCorrect ? 'breakdown-ans correct-ans' : 'breakdown-ans user-wrong'}">
              Your Answer: (${chosen}) ${q.options[ans.selectedIndex]}
            </span>
            ${!ans.isCorrect ? `<span class="breakdown-ans correct-ans">Correct: (${correct}) ${q.options[q.correctIndex]}</span>` : ''}
          </div>
          <div style="font-size:0.82rem; color:var(--muted); margin-top:4px;">
            ${q.whyCorrect}
          </div>
        `;
        this.elements.breakdownList.appendChild(item);
      });
    },

    /**
     * Pure SVG 5-Axis Radar Chart
     * Axes: Accuracy, Speed, Streak, Consistency, Difficulty Reached
     */
    renderRadarChart(accuracyPct, avgSpeedSec, maxStreak, totalQuestions, rating) {
      const container = this.elements.radarChartContainer;
      container.innerHTML = '';

      // Normalize metrics 0..100
      const normAccuracy = accuracyPct;
      const speedNum = parseFloat(avgSpeedSec) || 10;
      const normSpeed = Math.max(10, Math.min(100, Math.round(100 - (speedNum * 4))));
      const normStreak = Math.min(100, Math.round((maxStreak / totalQuestions) * 100));
      const normConsistency = Math.min(100, Math.max(20, Math.round(100 - Math.abs(50 - accuracyPct) * 0.5)));
      const normDifficulty = Math.min(100, Math.round(((rating - 800) / 800) * 100));

      const values = [normAccuracy, normSpeed, normStreak, normConsistency, normDifficulty];
      const labels = ['Accuracy', 'Speed', 'Streak', 'Consistency', 'Difficulty'];

      const size = 220;
      const center = size / 2;
      const radius = 75;
      const totalAxes = 5;

      const getCoord = (value, axisIndex) => {
        const angle = (Math.PI * 2 / totalAxes) * axisIndex - Math.PI / 2;
        const r = (value / 100) * radius;
        return {
          x: center + r * Math.cos(angle),
          y: center + r * Math.sin(angle)
        };
      };

      // Concentric background rings
      let ringsSvg = '';
      [0.25, 0.5, 0.75, 1.0].forEach(level => {
        const ringPoints = [];
        for (let i = 0; i < totalAxes; i++) {
          const pt = getCoord(level * 100, i);
          ringPoints.push(`${pt.x.toFixed(1)},${pt.y.toFixed(1)}`);
        }
        ringsSvg += `<polygon points="${ringPoints.join(' ')}" fill="none" stroke="currentColor" stroke-opacity="0.12" stroke-width="1"/>`;
      });

      // Axis lines & labels
      let axesSvg = '';
      for (let i = 0; i < totalAxes; i++) {
        const endPt = getCoord(100, i);
        const labelPt = getCoord(125, i);
        axesSvg += `<line x1="${center}" y1="${center}" x2="${endPt.x}" y2="${endPt.y}" stroke="currentColor" stroke-opacity="0.15" stroke-width="1"/>`;
        axesSvg += `<text x="${labelPt.x}" y="${labelPt.y + 4}" font-size="9" font-family="sans-serif" font-weight="600" text-anchor="middle" fill="var(--muted)">${labels[i]}</text>`;
      }

      // Value Polygon
      const dataPoints = values.map((val, i) => {
        const pt = getCoord(val, i);
        return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      }).join(' ');

      const svg = `
        <svg viewBox="0 0 ${size} ${size}">
          ${ringsSvg}
          ${axesSvg}
          <polygon points="${dataPoints}" fill="var(--accent)" fill-opacity="0.35" stroke="var(--accent)" stroke-width="2.5"/>
          ${values.map((v, i) => {
            const pt = getCoord(v, i);
            return `<circle cx="${pt.x}" cy="${pt.y}" r="3.5" fill="var(--accent)" stroke="#fff" stroke-width="1"/>`;
          }).join('')}
        </svg>
      `;

      container.innerHTML = svg;
    },

    /**
     * Pure SVG Line Graph for Mastery Progression
     */
    renderMasteryProgressionChart(ratingHistory) {
      const container = this.elements.masteryChartContainer;
      container.innerHTML = '';

      if (!ratingHistory || ratingHistory.length < 2) {
        container.innerHTML = `<div style="color:var(--muted); font-size:0.85rem;">Session completed with initial baseline rating (${ratingHistory[0] || 1000}).</div>`;
        return;
      }

      const width = 320;
      const height = 180;
      const padding = { top: 20, right: 25, bottom: 30, left: 45 };

      const minRating = Math.min(...ratingHistory) - 50;
      const maxRating = Math.max(...ratingHistory) + 50;
      const count = ratingHistory.length;

      const getX = idx => padding.left + (idx / (count - 1)) * (width - padding.left - padding.right);
      const getY = val => padding.top + (1 - (val - minRating) / (maxRating - minRating)) * (height - padding.top - padding.bottom);

      // Path data
      const points = ratingHistory.map((val, idx) => ({ x: getX(idx), y: getY(val), val }));
      const pathD = points.reduce((acc, pt, i) => i === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`, '');

      // Grid lines
      let gridSvg = '';
      const gridSteps = 3;
      for (let i = 0; i <= gridSteps; i++) {
        const val = Math.round(minRating + (i / gridSteps) * (maxRating - minRating));
        const y = getY(val);
        gridSvg += `
          <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="currentColor" stroke-opacity="0.1" stroke-dasharray="3,3"/>
          <text x="${padding.left - 6}" y="${y + 3}" font-size="9" text-anchor="end" fill="var(--muted)">${val}</text>
        `;
      }

      // X-axis ticks
      points.forEach((pt, i) => {
        gridSvg += `
          <text x="${pt.x}" y="${height - 10}" font-size="9" text-anchor="middle" fill="var(--muted)">Q${i}</text>
        `;
      });

      const svg = `
        <svg viewBox="0 0 ${width} ${height}">
          ${gridSvg}
          <path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          ${points.map(pt => `
            <circle cx="${pt.x}" cy="${pt.y}" r="3.5" fill="var(--card)" stroke="var(--accent)" stroke-width="2"/>
          `).join('')}
        </svg>
      `;

      container.innerHTML = svg;
    },

    exportResultsJson() {
      const state = QuizEngine.state;
      const exportData = {
        app: 'Adaptive Quiz Engine',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        subject: state.subject,
        level: state.level,
        stream: state.stream,
        difficulty: state.difficulty,
        score: state.score,
        total: state.questions.length,
        rating: state.playerRating,
        ratingHistory: state.ratingHistory,
        userAnswers: state.userAnswers,
        questions: state.questions.map(q => ({
          stem: q.stem,
          options: q.options,
          correctAnswer: q.options[q.correctIndex],
          topic: q.topic,
          whyCorrect: q.whyCorrect
        }))
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `adaptive_quiz_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('Downloaded results as JSON', 'success');
    },

    downloadQuizHtml() {
      const state = QuizEngine.state;
      const questions = state.questions;
      if (!questions || questions.length === 0) return;

      const questionsHtml = questions.map((q, i) => `
        <div style="margin-bottom:24px; padding:16px; border:1px solid #ddd; border-radius:8px; page-break-inside:avoid;">
          <h3 style="margin:0 0 10px; font-size:16px;">Question ${i + 1}: ${q.stem}</h3>
          <ol type="A" style="margin:0 0 12px; padding-left:24px;">
            ${q.options.map(opt => `<li style="margin-bottom:6px;">${opt}</li>`).join('')}
          </ol>
          <div style="font-size:13px; color:#555; background:#f9f9f9; padding:8px; border-radius:4px;">
            <strong>Answer Key:</strong> Option ${['A','B','C','D'][q.correctIndex]} (${q.options[q.correctIndex]})<br>
            <strong>Rationale:</strong> ${q.whyCorrect}
          </div>
        </div>
      `).join('');

      const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${state.subject || 'Adaptive Quiz'} — Study Sheet &amp; Answer Key</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #222; }
    h1 { border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 6px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 24px; }
    @media print { body { max-width: 100%; margin: 20px; } }
  </style>
</head>
<body>
  <h1>${state.subject || 'Adaptive Quiz'} — Self-Contained Study Sheet</h1>
  <div class="meta">Generated: ${new Date().toLocaleDateString()} &bull; Level: ${state.level} &bull; Stream: ${state.stream} &bull; Questions: ${questions.length}</div>
  ${questionsHtml}
</body>
</html>`;

      const blob = new Blob([fullHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quiz_study_sheet_${Date.now()}.html`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('Downloaded self-contained HTML quiz sheet', 'success');
    },

    openMistakesModal() {
      this.renderMistakesList();
      this.showModal(this.elements.modalMistakes);
    },

    renderMistakesList() {
      const mistakes = StorageManager.getMistakes();
      const list = this.elements.modalMistakesList;
      list.innerHTML = '';

      if (mistakes.length === 0) {
        list.innerHTML = '<div style="color:var(--muted); padding:1rem; text-align:center;">No missed questions saved yet. All clear!</div>';
        this.elements.btnLaunchMistakesQuiz.disabled = true;
        return;
      }

      this.elements.btnLaunchMistakesQuiz.disabled = false;
      mistakes.forEach((m, idx) => {
        const item = document.createElement('div');
        item.className = 'modal-list-item';
        item.innerHTML = `
          <div style="font-weight:600; color:var(--text); margin-bottom:4px;">Q${idx + 1}: ${m.stem}</div>
          <div style="font-size:0.8rem; color:var(--correct);">Correct: ${m.options[m.correctIndex]}</div>
          <div style="font-size:0.75rem; color:var(--muted); margin-top:2px;">${m.whyCorrect}</div>
        `;
        list.appendChild(item);
      });
    },

    launchMistakesQuiz() {
      const mistakes = StorageManager.getMistakes();
      if (mistakes.length === 0) {
        this.showToast('No mistakes to practice!', 'info');
        return;
      }

      this.hideModal(this.elements.modalMistakes);

      // Build quiz questions from mistakes
      const questions = mistakes.map(m => {
        const correctText = m.options[m.correctIndex];
        const newOptions = QuestionGenerator.shuffleArray([...m.options]);
        return {
          ...m,
          options: newOptions,
          correctIndex: newOptions.indexOf(correctText)
        };
      });

      QuizEngine.startQuiz(questions, {
        subject: 'Mistake Bank Spaced-Recall',
        level: 'Targeted Review',
        stream: 'All Streams',
        difficulty: 'Adaptive'
      });
      this.showToast('Launched targeted review on your mistake bank', 'success');
    },

    openHistoryModal() {
      this.renderHistoryList();
      this.showModal(this.elements.modalHistory);
    },

    renderHistoryList() {
      const history = StorageManager.getHistory();
      const list = this.elements.modalHistoryList;
      list.innerHTML = '';

      if (history.length === 0) {
        list.innerHTML = '<div style="color:var(--muted); padding:1rem; text-align:center;">No past attempts recorded yet.</div>';
        return;
      }

      history.forEach(item => {
        const div = document.createElement('div');
        div.className = 'modal-list-item';
        const dateStr = new Date(item.timestamp).toLocaleDateString();
        div.innerHTML = `
          <div style="display:flex; justify-content:space-between; font-weight:700; color:var(--text); margin-bottom:2px;">
            <span>${item.subject}</span>
            <span style="color:var(--accent);">${item.score}/${item.total} (${item.pct}%)</span>
          </div>
          <div style="font-size:0.78rem; color:var(--muted);">
            ${dateStr} &bull; Tier: ${item.tierReached} &bull; Avg: ${item.avgSpeedSec}s &bull; Max Streak: ${item.maxStreak}
          </div>
        `;
        list.appendChild(div);
      });
    },

    updateMistakesBadge() {
      const count = StorageManager.getMistakes().length;
      if (count > 0) {
        this.elements.headerMistakesBadge.textContent = count;
        this.elements.headerMistakesBadge.style.display = 'inline-block';
      } else {
        this.elements.headerMistakesBadge.style.display = 'none';
      }
    },

    toggleSound() {
      const settings = StorageManager.getSettings();
      settings.isMuted = !settings.isMuted;
      StorageManager.saveSettings(settings);

      this.updateSoundIcons(settings.isMuted);
      this.showToast(settings.isMuted ? 'Sound muted' : 'Sound enabled', 'info');
    },

    updateSoundIcons(isMuted) {
      if (isMuted) {
        this.elements.soundIconOn.style.display = 'none';
        this.elements.soundIconOff.style.display = 'block';
        this.elements.hudSoundIcon.style.opacity = '0.35';
      } else {
        this.elements.soundIconOn.style.display = 'block';
        this.elements.soundIconOff.style.display = 'none';
        this.elements.hudSoundIcon.style.opacity = '1';
      }
    },

    toggleTheme() {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      this.applyTheme(next);

      const settings = StorageManager.getSettings();
      settings.theme = next;
      StorageManager.saveSettings(settings);

      this.showToast(`${next === 'dark' ? 'Dark' : 'Light'} theme activated`, 'info');
    },

    applyTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      if (theme === 'light') {
        this.elements.themeIconSun.style.display = 'none';
        this.elements.themeIconMoon.style.display = 'block';
      } else {
        this.elements.themeIconSun.style.display = 'block';
        this.elements.themeIconMoon.style.display = 'none';
      }
    },

    showModal(modalEl) {
      modalEl.classList.add('active');
    },

    hideModal(modalEl) {
      modalEl.classList.remove('active');
    },

    showResumeModal(savedState) {
      this.showModal(this.elements.modalResume);
      this.elements.btnResumeAccept.onclick = () => {
        this.hideModal(this.elements.modalResume);
        QuizEngine.resumeQuiz(savedState);
      };
    },

    showToast(message, type = 'info') {
      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.textContent = message;

      this.elements.toastContainer.appendChild(toast);
      setTimeout(() => toast.classList.add('show'), 10);

      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 250);
      }, 3200);
    }
  };

  /* ==========================================================================
     9. BOOTSTRAP APP
     ========================================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    UIManager.init();
    QuizEngine.init();
  });

})();

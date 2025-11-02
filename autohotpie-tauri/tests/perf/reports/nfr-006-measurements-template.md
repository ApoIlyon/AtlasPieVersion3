# NFR-006 Cross-Platform Measurements (20 samples per platform)

**Date**: [YYYY-MM-DD]  
**Platforms**: Windows 10/11, macOS 13+, Ubuntu 22.04+  
**Goal**: Validate latency tolerances across platforms per NFR-006

## Measurement Protocol

1. **Environment Setup**:
   - Clean boot, close unnecessary applications
   - Run production Tauri build (`npm run tauri build`)
   - Launch application from installed bundle
   - Wait 30s for system stabilization

2. **Hotkey → Menu Latency**:
   - Press global hotkey (e.g., `Ctrl+Shift+P`)
   - Measure time from keypress to menu fully visible (using video capture @ 120fps)
   - Repeat 20 times with 5s interval between samples

3. **Autostart Toggle Latency**:
   - Open Settings → Autostart
   - Click "Enable" toggle
   - Measure time from click to state change confirmation (toast or UI update)
   - Repeat 20 times (10x enable, 10x disable)

## Results Template

### Platform: Windows 10 x64

#### Hotkey → Menu Latency (ms)
| Sample | Latency (ms) | Notes |
|--------|--------------|-------|
| 1      | 45           | -     |
| 2      | 42           | -     |
| ...    | ...          | ...   |
| 20     | 48           | -     |

**Statistics**:
- Mean: XX ms
- Median: XX ms
- P95: XX ms
- Min/Max: XX / XX ms

#### Autostart Toggle Latency (ms)
| Sample | Enable (ms) | Disable (ms) | Notes |
|--------|-------------|--------------|-------|
| 1      | 120         | 115          | -     |
| 2      | 118         | 112          | -     |
| ...    | ...         | ...          | ...   |
| 10     | 125         | 120          | -     |

**Statistics**:
- Mean (Enable): XX ms
- Mean (Disable): XX ms
- P95 (Enable): XX ms
- P95 (Disable): XX ms

---

### Platform: macOS 13 (M1)

[Repeat same structure]

---

### Platform: Ubuntu 22.04 (KDE Plasma)

[Repeat same structure]

---

## NFR-006 Tolerance Validation

| Platform     | Hotkey Latency (P95) | Target   | Status |
|--------------|----------------------|----------|--------|
| Windows      | XX ms                | ≤ 100 ms | ✅/❌   |
| macOS        | XX ms                | ≤ 100 ms | ✅/❌   |
| Ubuntu (KDE) | XX ms                | ≤ 100 ms | ✅/❌   |

| Platform     | Autostart Toggle (P95) | Target   | Status |
|--------------|------------------------|----------|--------|
| Windows      | XX ms                  | ≤ 200 ms | ✅/❌   |
| macOS        | XX ms                  | ≤ 200 ms | ✅/❌   |
| Ubuntu (KDE) | XX ms                  | ≤ 200 ms | ✅/❌   |

## Conclusion

- **Overall Status**: [PASS/FAIL]
- **Deviations**: [List any platform-specific issues]
- **Recommendations**: [Optimization suggestions if needed]

## Appendix

- Video captures: `tests/perf/reports/videos/[platform]-hotkey-sample-01.mp4`, etc.
- CSV exports: `tests/perf/reports/nfr-006-[platform]-hotkey.csv`
- System info: `tests/perf/reports/nfr-006-[platform]-sysinfo.txt`

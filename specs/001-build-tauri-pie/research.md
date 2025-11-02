# Research Log: AutoHotPie Tauri Native Suite

## Item 1: Playwright coverage depth & CI matrix
- **Decision**: Использовать Playwright smoke-набор с критическими сценариями (вызов pie-меню, профиль CRUD, импорт/экспорт JSON, запуск действия) на `windows-latest` и `ubuntu-latest` при каждом PR, плюс еженедельный ночной прогон на `macos-latest`.
- **Rationale**: Windows и Linux покрывают основные платформы CI и выявляют большинство регрессий; macOS менее доступен в CI и дорог, поэтому переносим на ночной регламент. Smoke-набор минимизирует время прогонов (<10 мин) при сохранении уверенности в ключевых флоу.
- **Alternatives considered**:
  - **Полный e2e-пакет на всех трёх ОС на каждый PR** — слишком долго и дорого, повышает время ожидания разработчиков.
  - **Запуск только на одной платформе** — не выявит платформенные расхождения (особенно глобальные хоткеи/macOS Accessibility).

## Item 2: UI-тематический стек (Tailwind vs Chakra)
- **Decision**: Применить Tailwind CSS с кастомными design tokens и headless-компонентами (Radix UI/Headless UI) для построения kando-подобного тёмного UI и анимаций pie-меню.
- **Rationale**: Tailwind даёт точный контроль над стилями и позволяет воспроизвести уникальную визуальность kando, сохраняя лёгкий бандл и простую интеграцию в Tauri. Headless-компоненты предоставляют доступные паттерны без навязанных стилей.
- **Alternatives considered**:
  - **Chakra UI** — быстрее старт, но сложнее повторить kando-стиль и pie-меню с нестандартной геометрией; потенциальные ограничения в кастомизации.
  - **Vanilla CSS/SASS** — больше ручной работы и отсутствие утилитарных токенов; выше риск несогласованности темизации.

## Item 3: UX Satisfaction Metrics Plan (T037d)

**Goal**: Collect qualitative and quantitative UX feedback to validate ≥4/5 satisfaction rating per NFR requirements.

### Methodology

1. **Beta Testing Phase** (Post-MVP, Pre-1.0 Release):
   - Recruit 10-15 beta testers from power-user communities (AutoHotkey forums, /r/productivity, etc.)
   - Distribute production build for 2-week trial period
   - Provide feedback survey and usage analytics opt-in

2. **Survey Questionnaire** (Google Forms / TypeForm):
   - Overall satisfaction (1-5 scale): "How satisfied are you with AutoHotPie Tauri?"
   - Feature-specific ratings (1-5):
     - Pie menu responsiveness
     - Profile management UX
     - Hotkey registration flow
     - Settings/localization
     - Tray integration
   - Open-ended feedback:
     - "What do you like most?"
     - "What would you improve?"
     - "Compared to AutoHotPie v1.x or Kando, how does this feel?"

3. **Usage Analytics** (Optional, Opt-in):
   - Track anonymized events: pie menu invocations, profile switches, action executions
   - Identify most/least used features
   - Measure crash rates, error frequencies

4. **Acceptance Criteria**:
   - **Primary Metric**: Mean overall satisfaction ≥ 4.0/5.0
   - **Secondary Metrics**: All feature ratings ≥ 3.5/5.0
   - **Qualitative**: No critical blockers reported in open feedback

### Timeline

- **Week 1-2**: Beta recruitment and onboarding
- **Week 3-4**: Data collection (survey + analytics)
- **Week 5**: Analysis and report generation
- **Week 6**: Implement critical feedback improvements (if needed)

### Contingency

- If satisfaction < 4.0: Conduct follow-up interviews with low-raters to identify pain points
- Prioritize top 3 issues for immediate fix
- Re-survey after fixes deployed

### Report Format

Results will be documented in `research.md` under **Item 3: UX Satisfaction Results** with:
- Summary statistics (mean, median, distribution)
- Verbatim quotes from open feedback
- Action items based on findings
- Recommendation: Proceed to 1.0 release / Hold for improvements

**Status**: Planned (awaiting MVP completion and beta recruitment)

# Quick Start Guide: Pie Menu Complete Redesign and Overhaul

**Feature**: Pie Menu Complete Redesign and Overhaul
**Target Audience**: New users setting up Atlas Pie for the first time
**Estimated Setup Time**: 10-15 minutes
**Platform Coverage**: Windows, macOS, Linux

## Overview

Welcome to the redesigned Atlas Pie! This updated version brings the beautiful interface from Kando combined with powerful functionality from AutoHotPie. This guide will help you get started with creating your first pie menu in just a few steps.

## Prerequisites

### System Requirements
- **Operating System**: Windows 10/11, macOS 12+, or Linux (Ubuntu 22.04+, Fedora 38+)
- **Hardware**: Intel Core i3 8th gen or equivalent, 4GB RAM
- **Permissions**: Administrator access for global hotkeys (one-time setup)

### Software Dependencies
- Atlas Pie application installed (latest version with overhaul)
- At least one application to test context binding (e.g., browser, text editor)

## Step 1: First Launch & Initial Setup

### Launch the Application
1. Install and run Atlas Pie
2. Grant necessary permissions when prompted:
   - Global keyboard shortcuts
   - Window/app monitoring (for context detection)
   - File system access (for configurations)

### Choose Your Preferences
The first-run wizard will guide you through:
- **Theme Selection**: Choose between "Kando Dark" (recommended) or "Kando Light"
- **Hotkey Setup**: Press your preferred global hotkey combo (default: `Ctrl + Shift + P`)
- **Animation Settings**: Toggle smooth animations on/off based on preference
- **Update Preferences**: Enable automatic update checks (recommended)

## Step 2: Create Your First Profile

### Access Profile Editor
1. Open Atlas Pie main window
2. Click **"+"** button next to "Profiles" or select **Profiles → New Profile**
3. Choose a template:
   - **Basic**: Simple starter menu
   - **Work**: Pre-configured for productivity
   - **Gaming**: Optimized for games
   - **Custom**: Start from scratch

### Configure Profile Basics
```markdown
Profile Name: "My First Menu"
Description: "Getting started with pie menus"
Hotkey: [Ctrl+Shift+P] (assigned in wizard)
```

### Add Context Binding (Optional but Recommended)
Bind your profile to specific apps for automatic activation:

1. Click **"Add Context Rule"**
2. Choose detection method:
   - **Auto-Detect**: Switch to target app (5-second timer starts)
   - **Manual**: Enter app name or process manually

3. Test the binding:
   - Switch between applications
   - Notice the profile indicator when conditions match

## Step 3: Design Your Pie Menu

### Navigate to Menu Editor
1. From profile view, select **"Edit Menu"**
2. Choose menu type: **Radial** (default, like Kando)

### Add Your First Slices

**Drag & Drop Method:**
1. Click **"Add Slice"** button
2. Drag slices from template gallery:
   - **Applications**: Firefox, VS Code, Terminal
   - **Actions**: Copy, Paste, New File
   - **Macros**: Pre-built keyboard sequences

**Manual Configuration:**
1. Right-click on a slice segment
2. Configure:
   ```markdown
   Label: "Open Browser"
   Icon: [web icon]
   Action: Launch Application
   Path: C:\Program Files\Mozilla Firefox\firefox.exe
   ```

### Customize Appearance
- **Colors**: Use Kando-inspired palette (#111111 background, #35B1FF accent)
- **Size**: Scale from 50% to 200% of default
- **Transparency**: Adjust opacity for less intrusive menus

### Enable/Disable Animations
- Toggle via **Settings → Appearance → Animations**
- Smooth open/close (ease-in-out 300ms) available when enabled

## Step 4: Test Your Menu

### Activate and Interact
1. **Press your global hotkey** while in any application
2. **Hover over slices** to see previews and tooltips
3. **Click a slice** to execute the action
4. **Right-click or press Escape** to close menu

### Test Context Conditions
1. Switch to a bound application
2. Press hotkey - menu should appear
3. Switch to unbound app - should not trigger menu

### Adjust and Refine
- Use **Undo/Redo** in editor (Ctrl+Z/Ctrl+Y)
- **Live Preview** shows changes immediately
- **Test Mode** executes actions without closing menu

## Step 5: Import & Export Basics

### Export Your Profile
Perfect for backing up or sharing:
1. **Profiles → [Your Profile] → Export**
2. Choose format: **JSON** (compatible with older AutoHotPie)
3. Select options:
   - Include actions: Yes
   - Compress: No (human-readable)

### Import Existing Configurations
If you have old AutoHotPie settings:
1. **Profiles → Import**
2. Select **Migration Mode**
3. Browse to your old JSON file
4. Review mapping suggestions

## Troubleshooting Common Issues

### Menu Not Appearing
- **Check hotkey conflict**: Use **Settings → Hotkeys → Test Hotkey**
- **Verify permissions**: Re-run app as administrator/sudo
- **Context mismatch**: Temporarily disable context rules

### Actions Not Executing
- **Validate paths**: Use **Actions → Test** button
- **Check permissions**: Some apps require elevated privileges
- **Macro conflicts**: Test macros in isolation

### Performance Issues
- **Disable animations**: Settings → Appearance → Animations → Off
- **Reduce menu size**: Smaller scales use less resources
- **Update system**: Ensure latest graphics drivers

### Logs and Diagnostics
1. **Open Log Viewer**: Bottom tray icon → "Open Log"
2. Filter by **ERROR**, **WARN**, **ACTION** levels
3. Use search for specific actions or apps
4. Export logs for support: **File → Export → Logs**

## Advanced Quick Setup

### Macro Recording
1. **Actions → Record Macro**
2. Perform your task sequence
3. Stop recording, save macro
4. Assign to slice and test

### Complex Context Rules
Configure multi-condition rules:
- **AND logic**: All conditions must match
- **OR logic**: Any condition can match
- **Nested patterns**: Use regex for sophisticated matching

### Theme Customization
Beyond defaults:
- **Import custom themes**: JSON-based theme files
- **Font selection**: Inter family supports most languages
- **Icon packs**: Drop SVG files into assets folder

## Next Steps

### Continue Learning
- Explore **Settings → Examples** for pre-built scenarios
- Join community forums for advanced configurations
- Check update notifications for new features

### Backup Your Setup
- **Regular exports** to cloud storage
- **Test restores** periodically
- **Version control** configurations if team use

### Optimize Performance
- Profile with **10-20 slices** for best balance
- Limit to **3-5 active profiles** simultaneously
- Monitor logs for optimization suggestions

---

*This quickstart covers the essentials for getting productive immediately. The full feature set offers limitless customization - explore the complete documentation for advanced workflows.*

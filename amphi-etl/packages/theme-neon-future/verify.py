#!/usr/bin/env python3
"""
Verification script for Neon Future Theme
Checks if the theme is properly installed and available
"""

import json
import subprocess
import sys
from pathlib import Path

def run_command(cmd):
    """Run a command and return output"""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        return result.returncode, result.stdout, result.stderr
    except Exception as e:
        return -1, "", str(e)

def check_jupyterlab():
    """Check if JupyterLab is installed"""
    print("Checking JupyterLab installation...")
    code, stdout, stderr = run_command("jupyter lab --version")
    if code == 0:
        print(f"  ✓ JupyterLab version: {stdout.strip()}")
        return True
    else:
        print(f"  ✗ JupyterLab not found: {stderr}")
        return False

def check_extension():
    """Check if theme extension is installed"""
    print("\nChecking theme extension...")
    code, stdout, stderr = run_command("jupyter labextension list")
    
    if "@amphi/theme-neon-future" in stdout:
        for line in stdout.split('\n'):
            if "@amphi/theme-neon-future" in line:
                print(f"  ✓ Theme found: {line.strip()}")
                if "enabled" in line and "OK" in line:
                    print("  ✓ Theme is enabled and OK")
                    return True
                else:
                    print("  ⚠ Theme may have issues")
                    return False
    else:
        print("  ✗ Theme not found in extension list")
        print(f"  Debug output: {stdout}")
        return False

def check_theme_files():
    """Check if theme files exist"""
    print("\nChecking theme files...")
    
    # Check various possible locations
    possible_paths = [
        Path("../../amphi/theme-neon-future/index.css"),
        Path("../amphi/theme-neon-future/index.css"),
        Path("amphi/theme-neon-future/index.css"),
    ]
    
    for path in possible_paths:
        if path.exists():
            print(f"  ✓ Theme files found at: {path.absolute()}")
            return True
    
    print("  ✗ Theme files not found")
    print("  Searched in:")
    for path in possible_paths:
        print(f"    - {path.absolute()}")
    return False

def check_browser_theme():
    """Instructions for browser verification"""
    print("\nBrowser verification:")
    print("  1. Start JupyterLab: jupyter lab")
    print("  2. Open http://localhost:8888 in your browser")
    print("  3. Go to Settings > Theme")
    print("  4. Look for 'Neon Future' in the list")

def main():
    print("=" * 50)
    print("  Neon Future Theme Verification")
    print("=" * 50)
    print()
    
    checks = [
        ("JupyterLab", check_jupyterlab),
        ("Extension", check_extension),
        ("Theme Files", check_theme_files),
    ]
    
    results = []
    for name, check_func in checks:
        try:
            result = check_func()
            results.append((name, result))
        except Exception as e:
            print(f"  ✗ Error during {name} check: {e}")
            results.append((name, False))
    
    print()
    print("=" * 50)
    print("  Summary")
    print("=" * 50)
    
    all_passed = True
    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"  {status}: {name}")
        if not result:
            all_passed = False
    
    print()
    check_browser_theme()
    
    if all_passed:
        print()
        print("🎉 All checks passed! The theme should be available.")
        print()
        print("If theme still doesn't appear:")
        print("  1. Clear browser cache (Ctrl+F5)")
        print("  2. Restart JupyterLab")
        print("  3. Run: jupyter lab clean && jupyter lab build")
        return 0
    else:
        print()
        print("❌ Some checks failed. Please see INSTALL.md for troubleshooting.")
        return 1

if __name__ == "__main__":
    sys.exit(main())

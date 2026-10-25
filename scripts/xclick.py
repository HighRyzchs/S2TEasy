"""Real pointer and keyboard input on the X display for e2e tests.

xclick.py X Y [click|double|move]   move to (X, Y), optionally click
xclick.py X Y drag X2 Y2            press at (X, Y), move to (X2, Y2), release
xclick.py 0 0 type TEXT             type TEXT (letters, digits, spaces)
xclick.py 0 0 key NAME              press one key (Return, Escape, ...)
"""
import sys
import time
from Xlib import X, XK, display
from Xlib.ext import xtest

d = display.Display()
x, y = int(sys.argv[1]), int(sys.argv[2])
action = sys.argv[3] if len(sys.argv) > 3 else 'click'


def press(name, shift=False):
    code = d.keysym_to_keycode(XK.string_to_keysym(name))
    shift_code = d.keysym_to_keycode(XK.XK_Shift_L)
    if shift:
        xtest.fake_input(d, X.KeyPress, shift_code)
    xtest.fake_input(d, X.KeyPress, code)
    d.sync()
    time.sleep(0.02)
    xtest.fake_input(d, X.KeyRelease, code)
    if shift:
        xtest.fake_input(d, X.KeyRelease, shift_code)
    d.sync()
    time.sleep(0.02)


if action == 'type':
    for ch in sys.argv[4]:
        press('space' if ch == ' ' else ch.lower(), ch.isupper())
    sys.exit(0)
if action == 'key':
    press(sys.argv[4])
    sys.exit(0)

xtest.fake_input(d, X.MotionNotify, x=x, y=y)
d.sync()
time.sleep(0.15)
if action == 'drag':
    x2, y2 = int(sys.argv[4]), int(sys.argv[5])
    xtest.fake_input(d, X.ButtonPress, 1)
    d.sync()
    for i in range(1, 11):
        time.sleep(0.03)
        xtest.fake_input(d, X.MotionNotify, x=x + (x2 - x) * i // 10, y=y + (y2 - y) * i // 10)
        d.sync()
    time.sleep(0.05)
    xtest.fake_input(d, X.ButtonRelease, 1)
    d.sync()
elif action in ('click', 'double'):
    for _ in range(2 if action == 'double' else 1):
        xtest.fake_input(d, X.ButtonPress, 1)
        d.sync()
        time.sleep(0.05)
        xtest.fake_input(d, X.ButtonRelease, 1)
        d.sync()
        time.sleep(0.08)

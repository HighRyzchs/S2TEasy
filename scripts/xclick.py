"""Real pointer input on the X display for e2e tests: move to (x, y), optionally click."""
import sys
import time
from Xlib import X, display
from Xlib.ext import xtest

d = display.Display()
x, y = int(sys.argv[1]), int(sys.argv[2])
action = sys.argv[3] if len(sys.argv) > 3 else 'click'
xtest.fake_input(d, X.MotionNotify, x=x, y=y)
d.sync()
time.sleep(0.25)  # longer than the app's 33 ms pointer check
if action in ('click', 'double'):
    for _ in range(2 if action == 'double' else 1):
        xtest.fake_input(d, X.ButtonPress, 1)
        d.sync()
        time.sleep(0.05)
        xtest.fake_input(d, X.ButtonRelease, 1)
        d.sync()
        time.sleep(0.08)

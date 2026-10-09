# Phone programming review

The private controller now uses the same square graphical Program cards as the
tabletop. Portrait hands use three columns, with enough rows for larger hands;
landscape uses two rows. The cards fit the space remaining above registers and
controls, including on a 320 × 568 phone.

Tapping loads the next empty register, or a register selected first. A graphical
copy flies to its destination. Touch dragging follows the finger and highlights
the destination; dragging a filled register also works. Mouse dragging and
keyboard activation remain available. Reduced motion skips the flight. Assigned
cards retain their register badges in the hand. Locked Programs use compact graphical
cards, stay read-only, and show an accurate locked status.

Owned Options are available above the programming or decision controls. Their
44-pixel buttons open the same graphical inspector used by web and tabletop play,
so players can read an Option before choosing their Program or answering a prompt.

When the last programmer is on the clock, every phone shows the shared countdown.
Other players can select **Call time on [name]** after it expires. This uses the
existing timeout action: chosen cards stay in place and only empty registers are
filled. The timed player can keep programming until someone calls time.

Scenario 028 covers phone portrait, small portrait and landscape; a native touch
drag; tap flight and reduced motion; Option inspection; countdown ownership and
expiry; and preservation of a partially filled Program after another phone calls
time. Existing private-controller and complete-race scenarios cover the surrounding
turn and decision flows. See its [illustrated walkthrough](../../tests/e2e/028-phone-programming-cards/README.md).

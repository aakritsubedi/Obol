// Generates the DMG installer background: a near-white canvas scattered with
// the stylized cursor motifs that flank the Obol.app and Applications icons.
//
// Usage: osascript -l JavaScript make-dmg-background.js <out.png> <widthPt> <heightPt>
//
// Output is rendered at 2x for retina. Dependency-free: CoreGraphics via the
// JXA Objective-C bridge, so packaging stays a pure shell + system-tools affair.

function run(argv) {
    ObjC.import("AppKit");
    ObjC.import("CoreGraphics");

    const out = argv[0];
    const widthPt = parseInt(argv[1], 10);
    const heightPt = parseInt(argv[2], 10);
    const scale = 2;
    const W = widthPt * scale;
    const H = heightPt * scale;

    // Brand palette (mirrors WidgetStyle.swift) plus installer-only accents.
    const colors = {
        red: [0.886, 0.298, 0.247],
        brown: [0.541, 0.353, 0.196],
        green: [0.208, 0.663, 0.486],
        purple: [0.482, 0.357, 0.839],
        blue: [0.184, 0.486, 0.965],
        orange: [0.910, 0.514, 0.227],
    };

    // Deterministic scatter, tuned to leave the icon columns clear. Fractions
    // of the canvas, rotation degrees, palette key, motif size in points.
    const motifs = [
        [0.615, 0.185, 185, "red", 48],
        [0.455, 0.335, 215, "brown", 40],
        [0.845, 0.285, 150, "green", 46],
        [0.135, 0.225, 335, "purple", 38],
        [0.475, 0.735, 25, "purple", 40],
        [0.855, 0.750, 320, "blue", 46],
        [0.615, 0.905, 345, "orange", 48],
    ];

    const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
        $(),
        W,
        H,
        8,
        4,
        true,
        false,
        $.NSDeviceRGBColorSpace,
        0,
        0,
    );
    // CGContext is a property on the bridged context, not a method.
    const cg = $.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep).CGContext;

    function fill(r, g, b, a) {
        $.CGContextSetRGBFillColor(cg, r, g, b, a);
    }

    function rotated(x, y, rad) {
        return [x * Math.cos(rad) - y * Math.sin(rad), x * Math.sin(rad) + y * Math.cos(rad)];
    }

    function drawMotif(fx, fy, degrees, key, sizePt) {
        const s = sizePt * scale;
        const rad = (degrees * Math.PI) / 180;
        const cx = fx * W;
        // AppKit's origin is bottom-left; the scatter fractions are top-left.
        const cy = (1 - fy) * H;

        const rgb = colors[key];
        fill(rgb[0], rgb[1], rgb[2], 0.92);

        // Cursor triangle, tip up.
        const points = [
            rotated(0, -s * 0.62, rad),
            rotated(-s * 0.52, s * 0.48, rad),
            rotated(s * 0.52, s * 0.42, rad),
        ];
        const tri = $.CGPathCreateMutable();
        $.CGPathMoveToPoint(tri, $(), cx + points[0][0], cy + points[0][1]);
        $.CGPathAddLineToPoint(tri, $(), cx + points[1][0], cy + points[1][1]);
        $.CGPathAddLineToPoint(tri, $(), cx + points[2][0], cy + points[2][1]);
        $.CGPathCloseSubpath(tri);
        $.CGContextAddPath(cg, tri);
        $.CGContextFillPath(cg);

        // Companion dot, tucked against the lower edge.
        const r = s * 0.17;
        const dotCenter = rotated(-s * 0.52, -s * 0.30, rad);
        const dot = $.CGPathCreateMutable();
        $.CGPathAddArc(dot, $(), cx + dotCenter[0], cy + dotCenter[1], r, 0, 2 * Math.PI, true);
        $.CGContextAddPath(cg, dot);
        $.CGContextFillPath(cg);
    }

    // Canvas: the same near-white card the popover uses.
    fill(0.957, 0.957, 0.965, 1);
    $.CGContextFillRect(cg, $.NSMakeRect(0, 0, W, H));

    for (const m of motifs) {
        drawMotif(m[0], m[1], m[2], m[3], m[4]);
    }

    const png = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $.NSDictionary.dictionary);
    if (!png.writeToFileAtomically(out, true)) {
        throw new Error("could not write " + out);
    }
    return out;
}

# Slide Grid Editing

Scene slides support object movement in the presentation viewer without changing
the object content model. Text and structured widgets remain editable after they
are moved.

## Interaction

- Click a scene text, image, shape, or widget to select it. An outlined box
  appears around the object.
- Drag any edge of the selected outline to move the object.
- Drag a selected outline corner to resize the object. Resizing moves only the
  active corner while the opposing corner stays fixed.
- Positions and box dimensions snap to an 8 pixel grid in the canonical 1280 by
  720 slide space, ensuring all four object corners land on grid intersections.
- Pointer movement changes the preview only after it crosses the next grid snap
  threshold.
- Normal viewing preserves authored scene coordinates exactly. Grid snapping is
  applied only when the user moves or resizes an object, preventing the editor
  from changing an untouched slide merely by rendering it.
- A minimal 40 pixel guide grid appears only while dragging. Four persistent
  corner markers show the snapped grid intersections where the object will land.
- Object positions are constrained to the slide boundary.
- Click selected text or widget content again to edit its existing content.
- Text, widget, and position changes mark the active slide as pending. A Save
  button appears beside Delete and persists the updated slide through the
  existing whole-slide edit mutation.

## Layout behavior

Scene nodes inside `absolute` or `overlay` groups retain their parent-local
coordinates. When an object is moved from a `stack` or `grid` group, the editor
materializes that group as `absolute` and records the currently resolved bounds
for all of its children. This keeps its visible composition intact before the
selected object is moved.

Native scene slides and schema-v5 content slides both use the movable 8 pixel
grid editor. Content slides remain schema-v5 documents and render through the
same semantic layout, theme, regions, typography, and widget renderer used by
thumbnails, fullscreen, PDF, and normal viewing. Title, subtitle, and block
geometry is stored as optional canonical 1280 by 720 bounds; editing never
replaces a correctly composed content slide with a lossy scene approximation.

An unpositioned content object remains in the semantic CSS layout. Moving or
resizing it records bounded geometry while preserving an anchor in its original
layout, so surrounding content does not jump. Changing the semantic slide
layout clears these geometry overrides because they were measured against the
previous composition. The selection outline and positioned content share the
same full-slide coordinate frame, so they remain aligned after a move or resize
is committed.

Pending edits are isolated to the active slide canvas. Thumbnails, fullscreen,
and exports continue to use the last saved presentation until the user selects
Save. A successful save replaces the canonical slide with the normalized server
response.

## Support visual backgrounds

The renderer promotes one semantic support visual into the slide background for
layouts that reserve an image plane:

- Cover and section layouts use a full-slide visual with a strong fade for text
  contrast.
- Media-left and media-right layouts use an edge-to-edge split visual on the
  corresponding side.
- Other layouts keep image blocks in the foreground.

The promoted block remains data in the content slide but is not rendered a
second time as a foreground image. Clicking a title, text block, widget, or
other occupied object edits that object. Clicking unoccupied slide space selects
the background visual and opens controls for its HTTPS URL, description, and
focal point. The background layer itself does not capture pointer events.

## Persistence

Moved objects are persisted as `SceneNodeBase.bounds` values in canonical slide
coordinates. The editor grid is not saved and does not appear in browser, PDF,
or PowerPoint exports.

## Iterate panel

On desktop, the Iterate panel expands from the right with a short easing
transition. The viewer uses the remaining horizontal space throughout the
transition, so slides, navigation, and thumbnails reflow continuously rather
than jumping after the panel opens. On smaller viewports, the panel retains its
overlay behavior and slides in from the right.

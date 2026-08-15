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
- Scene resolution also quantizes default object positions and dimensions to the
  same 8 pixel grid, so generated and unedited layouts start aligned.
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

When a schema-v5 content slide opens in the editor, it is converted to an
equivalent scene draft. The pending Save action persists the scene slide,
allowing its title and content objects to remain independently editable and
movable.

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

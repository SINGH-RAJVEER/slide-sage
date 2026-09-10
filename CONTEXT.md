# SlideSage glossary

## Template package

An immutable, curated PPTX file used as the visual and structural source for a new presentation. A template package contains slide designs, masters, layouts, themes, fonts, media, and native Office objects.

## Template manifest

A versioned description of a template package. It names reusable slide archetypes, writable objects, content limits, repeatability rules, and package identity.

## Slide archetype

A source slide design that the compiler may clone. An archetype has a narrative role, a set of writable slots, and rules that say where it may appear and whether it may repeat.

## Content assignment

The binding between generated content and one slide archetype. A presentation has one assignment for each requested slide.

## Presentation revision

An immutable PPTX file representing the complete presentation at a point in time. The current revision is the source for download, Office editing, previews, and later revisions.

## Preview set

The ordered slide images rendered from one presentation revision. A preview set never combines images from different revisions.

## Editor session

A time-limited grant that lets a user open one presentation revision in the configured Office editor. A successful save creates a new presentation revision.

## Generated content

AI-authored copy and data for manifest-defined writable slots. Generated content does not contain visual themes, coordinates, browser layout names, or CSS concepts.

## Legacy presentation

A presentation whose saved state predates canonical PPTX revisions. Legacy presentations require regeneration and do not enter the new editor through an automatic compatibility conversion.

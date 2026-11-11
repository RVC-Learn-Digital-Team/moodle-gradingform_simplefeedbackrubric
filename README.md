# Simple Feedback Rubric (gradingform_simplefeedbackrubric)

An advanced grading method for Moodle, based on the core rubric. Teachers define a grid of
criteria and text-only levels (no points). While grading, clicking a level can insert that
level's text into the assignment's feedback comments, and the grade itself is chosen from a
separate dropdown rather than calculated from the rubric.

## Requirements

- Moodle 4.5 LTS or later (`$plugin->requires = 2024100700`). Versions up to 5.1 are listed as supported.
- PHP as required by your Moodle version (8.1+ for 4.5, 8.2+ for 5.0 and 5.1).
- The assignment's "Feedback comments" feedback type must be enabled for the auto-insert feature.

## Installation

Install into `grade/grading/form/simplefeedbackrubric`:

- Moodle 4.5 and 5.0: `<moodle>/grade/grading/form/simplefeedbackrubric`
- Moodle 5.1 and later: `<moodle>/public/grade/grading/form/simplefeedbackrubric`
  (5.1 moved the web code into `/public`; plugins must live there too)

Then visit Site administration > Notifications, or run `php admin/cli/upgrade.php`.

## Text editor support

The rubric grid, level selection and the grade dropdown work with any text editor.
The optional "auto-populate comments" feature writes into the feedback comments editor and
depends on which editor the grader is using:

| Editor | Status |
|---|---|
| TinyMCE (default in 4.5, the only core editor from 5.0) | Supported. The plugin waits for TinyMCE to finish loading and edits the feedback through the TinyMCE API, so inserted text can be undone and is picked up by autosave. |
| Atto (Moodle 4.5 only; removed from core in 5.0) | Supported. |
| Plain text area | Auto-populate is not supported. |

Each criterion's text is inserted as a paragraph marked with `data-sfr-criterion="<criterion id>"`, in
rubric order when "criterion ordering" is on. Choosing another level replaces that paragraph, and
deselecting a level removes it. Feedback written by older versions of the plugin (which used
`<span name="comment-criteria-N">` markers) is still recognised and converted when edited.

If auto-populate misbehaves, turning the "auto-populate comments" option off in the rubric
definition leaves the rest of the grading method working normally.

## Known limitations

- Backups include criteria, levels and level selections, but not the grade chosen from the
  dropdown (`gradingform_sfrbric_grades`).

M.gradingform_simplefeedbackrubric = {};

// Add this helper function at the beginning of the file
M.gradingform_simplefeedbackrubric.getEditor = function(Y) {
    // Try Atto first
    var attoEditor = Y.one('.editor_atto_content');
    if (attoEditor) {
        return {
            element: attoEditor,
            type: 'atto'
        };
    }
    
    // Try TinyMCE 
    var tinyEditor = Y.one('#id_assignfeedbackcomments_editoreditable') || 
                     Y.one('.tox-edit-area iframe') || 
                     Y.one('iframe[id*="editable"]');
    if (tinyEditor) {
        return {
            element: tinyEditor,
            type: 'tinymce'
        };
    }
    
    return null;
};

M.gradingform_simplefeedbackrubric.getEditorContent = function(Y, editor) {
    if (!editor) return '';
    
    if (editor.type === 'atto') {
        return editor.element._node.innerHTML;
    } else if (editor.type === 'tinymce') {
        // For TinyMCE, we need to access the iframe content
        var iframe = editor.element;
        if (iframe.get('tagName').toLowerCase() === 'iframe') {
            var doc = iframe._node.contentDocument || iframe._node.contentWindow.document;
            return doc.body.innerHTML;
        } else {
            return editor.element.get('innerHTML');
        }
    }
    return '';
};

M.gradingform_simplefeedbackrubric.setEditorContent = function(Y, editor, content) {
    if (!editor) return;
    
    if (editor.type === 'atto') {
        editor.element.setContent(content);
    } else if (editor.type === 'tinymce') {
        var iframe = editor.element;
        if (iframe.get('tagName').toLowerCase() === 'iframe') {
            var doc = iframe._node.contentDocument || iframe._node.contentWindow.document;
            doc.body.innerHTML = content;
        } else {
            editor.element.set('innerHTML', content);
        }
    }
};

M.gradingform_simplefeedbackrubric.focusEditor = function(Y, editor) {
    if (!editor) return;
    
    if (editor.type === 'atto') {
        editor.element.focus();
    } else if (editor.type === 'tinymce') {
        // TinyMCE focus handling
        var iframe = editor.element;
        if (iframe.get('tagName').toLowerCase() === 'iframe') {
            iframe._node.contentWindow.focus();
        } else {
            editor.element.focus();
        }
    }
};

/**
 * This function is called for each simplefeedbackrubric on page.
 */
M.gradingform_simplefeedbackrubric.init = function(Y, options) {
    var editor = M.gradingform_simplefeedbackrubric.getEditor(Y);
    if (!editor) {
        console.warn('No supported editor found');
        return;
    }
    
    var editortext = M.gradingform_simplefeedbackrubric.getEditorContent(Y, editor);
    var pattern = new RegExp(/(<.*?>|\ )/);
    while (editortext.match(pattern)) {
        editortext = editortext.replace(pattern, '');
    }
    if (!editortext || editortext.length === 0) {
        if (options.criterionordering) {
            var criterion = options.criterion;
            for (var i = 0; i < criterion.length; ++i) {
                editortext += '<span name="comment-criteria-' + criterion[i] + '"></span>';
            }
        }
        M.gradingform_simplefeedbackrubric.setEditorContent(Y, editor, editortext);
    }
    Y.on('click', M.gradingform_simplefeedbackrubric.levelclick,
        '#simplefeedbackrubric-' + options.name + ' .level', null, Y, options.name, options.autopopulatecomments);
    Y.all('#simplefeedbackrubric-' + options.name + ' .radio').setStyle('display', 'none');
    Y.all('#simplefeedbackrubric-' + options.name + ' .level').each(function (node) {
        if (node.one('input[type=radio]').get('checked')) {
            node.addClass('checked');
        }
    });
};

M.gradingform_simplefeedbackrubric.levelclick = function(e, Y, name, autopopulatecomments) {
    var el = e.target;
    while (el && !el.hasClass('level')) {
        el = el.get('parentNode');
    }
    if (!el) {
        return;
    }

    if (autopopulatecomments) {
        var editor = M.gradingform_simplefeedbackrubric.getEditor(Y);
        if (!editor) return;
        
        var elementid = e._currentTarget.id;
        var pattern = new RegExp(/(?:advancedgrading-criteria-)(.*?)(?:-levels-)(\d+)/);
        var matches = elementid.match(pattern);
        var criteria = matches[1];

        // The current text in the comment.
        var currentcommenttext = M.gradingform_simplefeedbackrubric.getEditorContent(Y, editor);

        // The text in the rubric block which has been clicked.
        var clickedleveltext = e._currentTarget.innerText.trim();

        // The text in any previously selected rubric sibling block.
        var siblingtext = null;
        var siblingcriteria = null;
        var siblinglevel = null;

        el.siblings().each(function(sibling) {
            if (sibling.hasClass('checked')) {
                siblingtext = sibling._node.innerText;
                var siblingid = sibling._node.id;
                var siblingmatches = siblingid.match(pattern);
                siblingcriteria = siblingmatches[1];
                siblinglevel = siblingmatches[2];
                return false;
            }
        });

        // Construct the new text for the comment.
        var newcommenttext = null;

        // If a sibling rubric block is currently selected.
        if (siblingtext) {
            // If the current comment text already contains the selected sibling block text,
            // replace the contained sibling text string with the clicked rubric string.
            if (currentcommenttext.match(new RegExp('(<span name="comment-criteria-' + siblingcriteria + '">.*?<\/span>)'))) {
                newcommenttext = currentcommenttext.replace(
                    new RegExp(
                        '(<span name="comment-criteria-' + siblingcriteria + '">.*?<\/span>)'),
                        '<span name="comment-criteria-' + criteria + '"><p>' + clickedleveltext + '</p></span>'
                );
            } else {
                // If the current comment text should contain the selected sibling block text.
                newcommenttext = currentcommenttext + ' ' + '<span name="comment-criteria-' + criteria + '"><p>' + clickedleveltext + '</p></span>';
            }
        } else {
            // If no sibling rubric block is currently selected we are deselecting the rubric item,
            // remove the rubric text string from the comment text.
            if (el.hasClass('checked')) {
                newcommenttext = currentcommenttext.replace(
                    new RegExp('(<span name="comment-criteria-' + criteria + '">.*?<\/span>)'),
                    '<span name="comment-criteria-' + criteria + '"></span>'
                );
            } else {
                // If we are selecting the rubric item, add the rubric item text string to the comment text.
                // If current comment text does not contain the clicked rubric item text.
                if (!currentcommenttext.match(new RegExp('(<span name="comment-criteria-' + criteria + '">.*?<\/span>)'))) {
                    newcommenttext = currentcommenttext + ' ' + '<span name="comment-criteria-' + criteria + '"><p>' + clickedleveltext + '</p></span>';
                } else {
                    // Replace the contained sibling text string with the clicked rubric string.
                    newcommenttext = currentcommenttext.replace(
                        new RegExp(
                            '(<span name="comment-criteria-' + criteria + '">.*?<\/span>)'),
                            '<span name="comment-criteria-' + criteria + '"><p>' + clickedleveltext + '</p></span>'
                    );
                }
            }
        }

        if (newcommenttext) {
            M.gradingform_simplefeedbackrubric.setEditorContent(Y, editor, newcommenttext);
            var x = window.scrollX, y = window.scrollY;
            M.gradingform_simplefeedbackrubric.focusEditor(Y, editor);
            window.scrollTo(x, y);
        }
    }

    e.preventDefault();
    el.siblings().removeClass('checked');
    var chb = el.one('input[type=radio]');
    if (!chb.get('checked')) {
        chb.set('checked', true);
        el.addClass('checked');
    } else {
        el.removeClass('checked');
        el.get('parentNode').all('input[type=radio]').set('checked', false);
    }
};

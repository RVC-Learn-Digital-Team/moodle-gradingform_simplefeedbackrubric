<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Defines the simplefeedbackrubric edit form
 *
 * @package    gradingform_simplefeedbackrubric
 * @copyright  2016 onwards Catalyst IT {@link http://www.catalyst-eu.net/}
 * @author     Edwin Phillips <edwin.phillips@catalyst-eu.net>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 *
 * Based on code originating from package gradingform_rubric
 * @copyright  2011 Marina Glancy <marina@moodle.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot.'/lib/formslib.php');
require_once(dirname(__FILE__).'/simplefeedbackrubriceditor.php');
MoodleQuickForm::registerElementType('simplefeedbackrubriceditor',
        $CFG->dirroot.'/grade/grading/form/simplefeedbackrubric/simplefeedbackrubriceditor.php',
        'MoodleQuickForm_simplefeedbackrubriceditor');

class gradingform_simplefeedbackrubric_editsimplefeedbackrubric extends moodleform {

    /**
     * Form element definition
     */
    public function definition() {
        $form = $this->_form;

        $form->addElement('hidden', 'areaid');
        $form->setType('areaid', PARAM_INT);

        $form->addElement('hidden', 'returnurl');
        $form->setType('returnurl', PARAM_LOCALURL);

        // Name.
        $form->addElement('text', 'name', get_string('name', 'gradingform_simplefeedbackrubric'), array('size' => 52));
        $form->addRule('name', get_string('required'), 'required');
        $form->setType('name', PARAM_TEXT);

        // Description.
        $options = gradingform_simplefeedbackrubric_controller::description_form_field_options($this->_customdata['context']);
        $form->addElement('editor', 'description_editor',
                get_string('description', 'gradingform_simplefeedbackrubric'), null, $options);
        $form->setType('description_editor', PARAM_RAW);

        // Simplefeedbackrubric completion status.
        $choices = array();
        $choices[gradingform_controller::DEFINITION_STATUS_DRAFT] = html_writer::tag('span',
                get_string('statusdraft', 'core_grading'), array('class' => 'status draft'));
        $choices[gradingform_controller::DEFINITION_STATUS_READY] = html_writer::tag('span',
                get_string('statusready', 'core_grading'), array('class' => 'status ready'));
        $form->addElement('select', 'status',
                get_string('simplefeedbackrubricstatus', 'gradingform_simplefeedbackrubric'), $choices)->freeze();

        // Simplefeedbackrubric editor.
        $element = $form->addElement('simplefeedbackrubriceditor', 'simplefeedbackrubric',
                get_string('simplefeedbackrubric', 'gradingform_simplefeedbackrubric'));
        $form->setType('simplefeedbackrubric', PARAM_RAW);

        $buttonarray = array();
        $buttonarray[] = &$form->createElement('submit', 'savesimplefeedbackrubric',
                get_string('savesimplefeedbackrubric', 'gradingform_simplefeedbackrubric'));
        if ($this->_customdata['allowdraft']) {
            $buttonarray[] = &$form->createElement('submit', 'savesimplefeedbackrubricdraft',
                    get_string('savesimplefeedbackrubricdraft', 'gradingform_simplefeedbackrubric'));
        }
        $editbutton = &$form->createElement('submit', 'editsimplefeedbackrubric', ' ');
        $editbutton->freeze();
        $buttonarray[] = &$editbutton;
        $buttonarray[] = &$form->createElement('cancel');
        $form->addGroup($buttonarray, 'buttonar', '', array(' '), false);
        $form->closeHeaderBefore('buttonar');
    }

    /**
     * Setup the form depending on current values. This method is called after definition(),
     * data submission and set_data().
     * All form setup that is dependent on form values should go in here.
     *
     * We remove the element status if there is no current status (i.e. simplefeedbackrubric is only being created)
     * so the users do not get confused
     */
    public function definition_after_data() {
        $form = $this->_form;
        $el = $form->getElement('status');
        if (!$el->getValue()) {
            $form->removeElement('status');
        } else {
            $vals = array_values($el->getValue());
            if ($vals[0] == gradingform_controller::DEFINITION_STATUS_READY) {
                $this->findbutton('savesimplefeedbackrubric')->setValue(get_string('save', 'gradingform_simplefeedbackrubric'));
            }
        }
    }

    /**
     * Form vlidation.
     * If there are errors return array of errors ("fieldname"=>"error message"),
     * otherwise true if ok.
     *
     * @param array $data array of ("fieldname"=>value) of submitted data
     * @param array $files array of uploaded files "element_name"=>tmp_file_path
     * @return array of "element_name"=>"error_description" if there are errors,
     *               or an empty array if everything is OK (true allowed for backwards compatibility too).
     */
    public function validation($data, $files) {
        $err = parent::validation($data, $files);
        $err = array();
        $form = $this->_form;
        $simplefeedbackrubricel = $form->getElement('simplefeedbackrubric');
        if ($simplefeedbackrubricel->non_js_button_pressed($data['simplefeedbackrubric'])) {
            // If JS is disabled and button such as 'Add criterion' is pressed - prevent from submit.
            $err['simplefeedbackrubricdummy'] = 1;
        } else if (isset($data['editsimplefeedbackrubric'])) {
            // Continue editing.
            $err['simplefeedbackrubricdummy'] = 1;
        } else if (isset($data['savesimplefeedbackrubric']) && $data['savesimplefeedbackrubric']) {
            // If user attempts to make simplefeedbackrubric active - it needs to be validated.
            if ($simplefeedbackrubricel->validate($data['simplefeedbackrubric']) !== false) {
                $err['simplefeedbackrubricdummy'] = 1;
            }
        }
        return $err;
    }

    /**
     * Return submitted data if properly submitted or returns NULL if validation fails or
     * if there is no submitted data.
     *
     * @return object submitted data; NULL if not valid or not submitted or cancelled
     */
    public function get_data() {
        $data = parent::get_data();
        if (!empty($data->savesimplefeedbackrubric)) {
            $data->status = gradingform_controller::DEFINITION_STATUS_READY;
        } else if (!empty($data->savesimplefeedbackrubricdraft)) {
            $data->status = gradingform_controller::DEFINITION_STATUS_DRAFT;
        }
        return $data;
    }

    /**
     * Check if there are changes in the simplefeedbackrubric and it is needed to ask user whether to
     * mark the current grades for re-grading. User may confirm re-grading and continue,
     * return to editing or cancel the changes
     *
     * @param gradingform_simplefeedbackrubric_controller $controller
     */
    public function need_confirm_regrading($controller) {
        $data = $this->get_data();
        if (isset($data->simplefeedbackrubric['regrade'])) {
            // We have already displayed the confirmation on the previous step.
            return false;
        }
        if (!isset($data->savesimplefeedbackrubric) || !$data->savesimplefeedbackrubric) {
            // We only need confirmation when button 'Save simplefeedbackrubric' is pressed.
            return false;
        }
        if (!$controller->has_active_instances()) {
            // Nothing to re-grade, confirmation not needed.
            return false;
        }
        $changelevel = $controller->update_or_check_simplefeedbackrubric($data);
        if ($changelevel == 0) {
            // No changes in the simplefeedbackrubric, no confirmation needed.
            return false;
        }

        // Freeze form elements and pass the values in hidden fields.
        $form = $this->_form;
        foreach (array('simplefeedbackrubric', 'name') as $fieldname) {
            $el =& $form->getElement($fieldname);
            $el->freeze();
            $el->setPersistantFreeze(true);
            if ($fieldname == 'simplefeedbackrubric') {
                $el->add_regrade_confirmation($changelevel);
            }
        }

        // Replace button text 'savesimplefeedbackrubric' and unfreeze 'Back to edit' button.
        $this->findbutton('savesimplefeedbackrubric')->setValue(get_string('continue'));
        $el =& $this->findbutton('editsimplefeedbackrubric');
        $el->setValue(get_string('backtoediting', 'gradingform_simplefeedbackrubric'));
        $el->unfreeze();

        return true;
    }

    /**
     * Returns a form element (submit button) with the name $elementname
     *
     * @param string $elementname
     * @return HTML_QuickForm_element
     */
    protected function &findbutton($elementname) {
        $form = $this->_form;
        $buttonar =& $form->getElement('buttonar');
        $elements =& $buttonar->getElements();
        foreach ($elements as $el) {
            if ($el->getName() == $elementname) {
                return $el;
            }
        }
        $notfound = null;
        return $notfound;
    }
}

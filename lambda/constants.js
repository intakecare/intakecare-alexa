module.exports = {
    // we now specify which attributes are saved (see the save interceptor below)
    PERSISTENT_ATTRIBUTES_NAMES: ['access_token', 'name', 'reminders', 'list_interval_intakes',
    'count_intakes', 'signed_medicine_MSG', 'all_therapies', 'edit_therapies', 'new_therapies', 
    'updated_therapies', 'count_new_therapies', 'count_updated_therapies', 'therapies'],
    // these are the permissions needed to fetch the first name
    //GIVEN_NAME_PERMISSION: ['alexa::profile:given_name:read'],
    // these are the permissions needed to send reminders
    //REMINDERS_PERMISSION: ['alexa::alerts:reminders:skill:readwrite'],
}
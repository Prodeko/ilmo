/*
 * Flags of features that only the client gates: the typed time boxes, event
 * templates and the registration form preview in the event form, and the
 * confetti after creating an event or a registration. They have no other
 * database objects.
 */
insert into app_public.feature_flags (key, description)
  values
    ('typed_time_input', E'Typed hour, minute and second boxes for the event and registration times in the event form, and default times when a day is clicked.'),
    ('event_templates', E'Event templates in the event form: template selectors and ready-made quotas and questions.'),
    ('form_preview', E'Registration form preview tab in the event form.'),
    ('confetti', E'Confetti after an event or a registration has been created.')
  on conflict (key) do nothing;

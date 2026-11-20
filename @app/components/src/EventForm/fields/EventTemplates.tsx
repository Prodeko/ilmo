/**
 * Event templates: the template selectors and ready-made quotas and
 * questions on the quotas and questions tabs. This is the feature's only
 * switch; when it is off, the tabs show the plain lists.
 */
export const EventTemplates: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const eventTemplates = true
  return eventTemplates ? <>{children}</> : null
}

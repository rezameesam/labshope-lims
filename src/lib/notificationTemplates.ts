export type NotificationTemplateContext = Record<string, string>;

export const renderNotificationTemplate = (
  template: string,
  context: NotificationTemplateContext,
) =>
  Object.entries(context).reduce((result, [key, value]) => {
    const safeValue = value ?? "";
    return result.replaceAll(`{${key}}`, safeValue);
  }, template);

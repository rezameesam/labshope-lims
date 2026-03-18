import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Check,
  ClipboardList,
  CreditCard,
  Globe,
  Settings,
  Users,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  usePlatformNotifications,
  type PlatformNotification,
} from "@/hooks/usePlatformNotifications";

const TYPE_ICONS = {
  lead: Users,
  onboarding: ClipboardList,
  dns: Globe,
  system: Settings,
  revenue: CreditCard,
} as const;

const TYPE_COLORS: Record<string, string> = {
  lead: "text-emerald-600 bg-emerald-50",
  onboarding: "text-blue-600 bg-blue-50",
  dns: "text-amber-600 bg-amber-50",
  system: "text-slate-500 bg-slate-100",
  revenue: "text-indigo-600 bg-indigo-50",
};

const formatTime = (iso: string): string => {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const NotificationItem = ({
  notification,
  onRead,
  onClose,
}: {
  notification: PlatformNotification;
  onRead: (id: string) => void;
  onClose: () => void;
}) => {
  const navigate = useNavigate();
  const Icon = TYPE_ICONS[notification.type] ?? Settings;
  const colorClass = TYPE_COLORS[notification.type] ?? TYPE_COLORS.system;

  const handleClick = () => {
    if (!notification.is_read) {
      onRead(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
      onClose();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`w-full rounded-xl px-3 py-3 text-left transition hover:bg-slate-50 ${
        !notification.is_read ? "bg-indigo-50/60" : ""
      }`}
    >
      <div className="flex gap-3">
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${colorClass}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p
              className={`text-sm font-medium leading-tight ${
                notification.is_read ? "text-slate-600" : "text-slate-900"
              }`}
            >
              {notification.title}
            </p>
            {!notification.is_read && (
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
            {notification.description}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">{formatTime(notification.created_at)}</p>
        </div>
      </div>
    </button>
  );
};

export const NotificationBell = () => {
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, markAsRead, markAllAsRead } =
    usePlatformNotifications();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          className="relative rounded-xl p-2 text-slate-400 transition hover:bg-white/8 hover:text-slate-200"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        className="w-80 rounded-2xl border border-slate-200 bg-white p-0 shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
            {unreadCount > 0 && (
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-600">
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllAsRead()}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-indigo-600 transition hover:bg-indigo-50"
            >
              <Check className="h-3 w-3" />
              Mark all read
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-[420px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Bell className="h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-400">No notifications yet</p>
            </div>
          ) : (
            <div className="p-2">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onRead={(id) => void markAsRead(id)}
                  onClose={() => setOpen(false)}
                />
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

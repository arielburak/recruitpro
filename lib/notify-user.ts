// Helper para notificar a teammates internos del agency portal.
// Centraliza el chequeo de isActive: si el destinatario está
// desactivado, NI se crea la in-app notification NI se manda email.
// Sin esto, un user soft-released seguía recibiendo mails que ya
// no podía leer (mailbox abandonado → bounces) y notificaciones
// que nadie iba a ver. Cada call site que quiera notificar a un
// teammate debería usar este helper en lugar de tocar
// prisma.userNotification.create + sendXEmail directo.

import { prisma } from "@/lib/prisma";

type NotificationInput = {
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
};

type EmailFn = (recipient: { email: string; name: string | null }) => Promise<void>;

export async function notifyUserIfActive(
  userId: string,
  options: {
    notification?: NotificationInput;
    email?: EmailFn;
  },
): Promise<{ delivered: boolean; reason?: "inactive" | "missing" }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, isActive: true },
  });

  if (!user) return { delivered: false, reason: "missing" };
  if (!user.isActive) return { delivered: false, reason: "inactive" };

  if (options.notification) {
    try {
      await prisma.userNotification.create({
        data: {
          userId,
          type: options.notification.type,
          title: options.notification.title,
          body: options.notification.body ?? null,
          link: options.notification.link ?? null,
        },
      });
    } catch (e) {
      console.error("[notify-user] in-app notification failed:", e);
    }
  }

  if (options.email && user.email) {
    try {
      await options.email({ email: user.email, name: user.name });
    } catch (e) {
      console.error("[notify-user] email failed:", e);
    }
  }

  return { delivered: true };
}

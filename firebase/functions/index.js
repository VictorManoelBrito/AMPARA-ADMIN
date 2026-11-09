/**
 * AMPARA - Cloud Function (Firebase Cloud Messaging)
 *
 * Quando o administrador altera o status de uma denúncia IDENTIFICADA,
 * envia uma notificação push para o aparelho do usuário, mesmo com o app fechado.
 * Denúncias anônimas não têm usuário vinculado e, por isso, não geram notificação.
 *
 * Requer o plano Blaze do Firebase para publicar (há cota gratuita mensal).
 */
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

exports.notificarMudancaStatus = onDocumentUpdated("denuncias/{denunciaId}", async (event) => {
  const antes = event.data.before.data();
  const depois = event.data.after.data();

  if (!antes || !depois || antes.status === depois.status) return;
  if (depois.anonimo || !depois.usuarioId) return;

  const usuarioRef = getFirestore().collection("Usuarios").doc(depois.usuarioId);
  const usuario = await usuarioRef.get();
  const token = usuario.exists ? usuario.get("fcmToken") : null;
  if (!token) return;

  try {
    await getMessaging().send({
      token,
      notification: {
        title: "Status da denúncia atualizado",
        body: `Sua denúncia ${depois.protocolo || ""} agora está: ${depois.status}`.replace("  ", " ")
      },
      data: { tipo: "status", denunciaId: event.params.denunciaId },
      android: { notification: { channelId: "ampara_notifications" } }
    });
  } catch (erro) {
    // Token expirado/inválido: remove para não tentar de novo.
    if (erro.code === "messaging/registration-token-not-registered") {
      await usuarioRef.update({ fcmToken: FieldValue.delete() });
    } else {
      console.error("Erro ao enviar notificação:", erro);
    }
  }
});

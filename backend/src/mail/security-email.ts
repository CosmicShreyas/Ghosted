// Security email: "new sign-in to your account", with device, browser, rough location and time.
// Always sent (it isn't a notification you can switch off), in the account's sassy or calm voice.
import type { Device } from "../devices.js";
import { button, escape, layout, type Tone } from "./otp-email.js";

const KIND = { mobile: "Phone", tablet: "Tablet", desktop: "Computer" } as const;

// Times are shown in India Standard Time, with the zone spelled out so nobody has to guess.
const IST = (d: Date) => `${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(d)} IST`;

const row = (label: string, value: string) => `<tr><td style="padding:6px 0;font-family:Inter,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:#6B6460;width:110px;vertical-align:top;">${label}</td><td style="padding:6px 0;font-family:Inter,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#141110;">${escape(value)}</td></tr>`;

export function newSignInEmail({ appUrl, tone, handle, device, place, at }: { appUrl: string; tone: Tone; handle: string; device: Device; place: string | null; at: Date }) {
  const sassy = tone === "sassy";
  const what = `${device.browser} on ${device.os}`;
  const subject = sassy ? `New sign-in on ${what}. Was that you?` : `New sign-in to your Ghosted account`;
  const details = `<tr><td style="padding:0 28px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid #141110;border-radius:12px;background:#FAF7F2;padding:10px 16px;">
    ${row("Device", KIND[device.kind])}${row("Browser", what)}${row("Location", place ?? "Unknown (approximate location unavailable)")}${row("Time", IST(at))}
  </table></td></tr>`;
  const advice = sassy
    ? "Not you? Unlike a recruiter, don't ignore this. Open Settings → Security, sign that device out, and change your password."
    : "If this wasn't you, open Settings → Security to sign that device out, then change your password.";
  const html = layout({
    appUrl, subject, banner: "Security alert",
    heading: sassy ? `${escape(handle)}, someone just walked in.` : `Hi ${escape(handle)}, there was a new sign-in.`,
    ...(sassy && { tagline: "Hopefully it was you, fresh from another round of interviews." }),
    intro: sassy ? "Your account was just signed in to from this device. If it was you, carry on spilling." : "Your Ghosted account was just signed in to from the device below. If this was you, there's nothing to do.",
    body: details + `<tr><td style="padding:0 28px 20px;font-family:Inter,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#141110;">${escape(advice)}</td></tr>` + button(`${appUrl}/dashboard`, sassy ? "Check my devices" : "Review devices"),
    footnote: "Location is approximate (city level) and based on the network, so it can be off, especially on mobile data. We send this for every new sign-in to keep your account safe.",
    preheader: `${what}${place ? ` · ${place}` : ""} · ${IST(at)}`,
  });
  const text = `${subject}\n\nDevice: ${KIND[device.kind]}\nBrowser: ${what}\nLocation: ${place ?? "Unknown"}\nTime: ${IST(at)}\n\n${advice}\n\n${appUrl}/dashboard`;
  return { subject, html, text };
}

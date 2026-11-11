import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const required = (max: number, label: string) => text(max).min(1, `${label} is required`);

export const contactSchema = z.object({
  name: required(120, "Name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  phone: text(30).regex(/^[0-9()+\-.\s]{7,30}$/, "Enter a valid phone number"),
  address: required(200, "Street address"),
  city: required(100, "City"),
  zip: text(10).regex(/^\d{5}(-\d{4})?$/, "Enter a 5-digit ZIP code"),
});

export const orderSchema = contactSchema.extend({
  notes: text(1000).default(""),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startMin: z.number().int().min(0).max(1440),
  items: z
    .array(z.object({ serviceId: z.number().int().positive(), qty: z.number().int().min(1).max(10) }))
    .min(1, "Your cart is empty")
    .max(20),
  website: z.string().max(0).optional(), // honeypot
});

export const membershipSchema = contactSchema.extend({
  planId: z.number().int().positive(),
  generator: text(200).default(""),
  website: z.string().max(0).optional(),
});

export const visitSchema = z.object({
  name: required(120, "Name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  phone: text(30).regex(/^[0-9()+\-.\s]{7,30}$/, "Enter a valid phone number"),
  address: text(200).default(""),
  zip: text(10).regex(/^(\d{5}(-\d{4})?)?$/, "Enter a 5-digit ZIP code").default(""),
  topic: text(120).default(""),
  details: text(2000).default(""),
  preferredDay: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),
  preferredTime: z.enum(["", "Morning", "Afternoon", "Evening"]).default(""),
  website: z.string().max(0).optional(),
});

export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Please check the form and try again.";
}

import { useState } from "react";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useAction } from "convex/react";
import { z } from "zod";
import { toast } from "sonner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { BackLink } from "@/components/BackLink";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/useMe";
import { RequireAuth } from "@/lib/route-guards";
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/account/")({
  component: () => (
    <RequireAuth>
      <AccountPage />
    </RequireAuth>
  ),
});

function AccountPage() {
  return (
    <div className="space-y-6">
      <BackLink to="/" />
      <PageHeader
        title="Account Settings"
        description="Update the email and password tied to your sign-in."
      />
      <EmailCard />
      <PasswordCard />
    </div>
  );
}

// ---------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------

const emailSchema = z.object({
  newEmail: z.email("Enter a valid email"),
  currentPassword: z.string().min(1, "Required"),
});
type EmailFormValues = z.infer<typeof emailSchema>;

function EmailCard() {
  const me = useMe();
  const changeEmail = useAction(api.auth.changeEmail);
  const [busy, setBusy] = useState(false);

  const form = useForm<EmailFormValues>({
    resolver: standardSchemaResolver(emailSchema),
    defaultValues: { newEmail: "", currentPassword: "" },
  });

  async function onSubmit(values: EmailFormValues) {
    setBusy(true);
    try {
      await changeEmail({
        newEmail: values.newEmail,
        currentPassword: values.currentPassword,
      });
      toast.success("Email updated");
      form.reset({ newEmail: "", currentPassword: "" });
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not update email"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Change email</CardTitle>
        <CardDescription>
          Current address: {me?.user.email ?? "—"}. We'll verify your password
          before applying the change.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            className="space-y-4"
            onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
          >
            <FormField
              control={form.control}
              name="newEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current password</FormLabel>
                  <FormControl>
                    <PasswordInput
                      autoComplete="current-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={busy}>
                {busy ? "Updating…" : "Update email"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Required"),
    newPassword: z
      .string()
      .min(8, "Password is too short")
      .regex(/[A-Z]/, "Add an uppercase letter")
      .regex(/[a-z]/, "Add a lowercase letter")
      .regex(/\d/, "Add a digit"),
    confirmPassword: z.string().min(1, "Required"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Doesn't match",
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    path: ["newPassword"],
    message: "New password must be different",
  });

type PasswordFormValues = z.infer<typeof passwordSchema>;

function PasswordCard() {
  const changePassword = useAction(api.auth.changePassword);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const form = useForm<PasswordFormValues>({
    resolver: standardSchemaResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: PasswordFormValues) {
    setBusy(true);
    try {
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      toast.success("Password updated");
      void navigate({ to: "/" });
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not update password"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Change password
        </CardTitle>
        <CardDescription>
          Use at least 8 characters, with one uppercase letter, one lowercase
          letter, and one digit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            className="space-y-4"
            onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
          >
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current password</FormLabel>
                  <FormControl>
                    <PasswordInput
                      autoComplete="current-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm new password</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={busy}>
                {busy ? "Updating…" : "Update password"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { TimezoneBuddy } from "@/components/TimezoneBuddy";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Time-Zone Buddy — Compare cities at a glance" },
      {
        name: "description",
        content:
          "Pin world cities to a horizontal timeline and scrub through the day to find the perfect meeting time across timezones.",
      },
    ],
  }),
});

function Index() {
  return (
    <>
      <TimezoneBuddy />
      <Toaster />
    </>
  );
}

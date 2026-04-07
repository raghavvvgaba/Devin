import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/onboarding(.*)",
  "/projects(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:css|js(?!on)|jpg|jpeg|gif|png|svg|ico|ttf|woff2?|json|map|txt|xml)).*)",
    "/(api|trpc)(.*)",
  ],
};

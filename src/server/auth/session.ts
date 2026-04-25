import { auth } from "@clerk/nextjs/server";
import { cache } from "react";

export const getAuth = cache(async () => auth());

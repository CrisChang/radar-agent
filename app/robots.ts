import type { MetadataRoute } from "next";
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:"*",allow:["/","/integrate","/evidence"],disallow:["/pilot","/validation","/billing","/downloads/"]}};}

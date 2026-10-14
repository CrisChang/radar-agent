"use client";
import { useState } from "react";
export default function CopyCommand({command}:{command:string}){const [status,setStatus]=useState("Copy");return <div className="copy-code"><pre>{command}</pre><button aria-label="Copy free API quote command" onClick={()=>void navigator.clipboard.writeText(command).then(()=>setStatus("Copied")).catch(()=>setStatus("Select the command to copy"))}>{status}</button></div>;}

import { MARKETPLACE_GYMS } from "@/lib/public/experience-data";
import GymAdminDetail from "./gym-admin-detail";

export function generateStaticParams(){return MARKETPLACE_GYMS.map((gym)=>({gymId:gym.id}));}
export default async function PlatformGymPage({params}:{params:Promise<{gymId:string}>}){const {gymId}=await params;return <GymAdminDetail gymId={gymId}/>;}

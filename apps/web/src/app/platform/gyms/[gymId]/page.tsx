import GymAdminDetail from "./gym-admin-detail";

export const dynamicParams = true;
export default async function PlatformGymPage({params}:{params:Promise<{gymId:string}>}){const {gymId}=await params;return <GymAdminDetail gymId={gymId}/>;}

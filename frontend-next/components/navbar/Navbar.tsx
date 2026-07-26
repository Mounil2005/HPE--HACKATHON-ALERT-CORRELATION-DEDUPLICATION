import { auth } from "@/auth";
import { Search } from "@/components/navbar/Search";
import { AlertLensLinks } from "@/components/navbar/AlertLensLinks";
import { UserInfo } from "@/components/navbar/UserInfo";
import { Menu } from "@/components/navbar/Menu";
import { MinimizeMenuButton } from "@/components/navbar/MinimizeMenuButton";
import "./Navbar.css";

export default async function NavbarInner() {
  const session = await auth();

  return (
    <>
      <Menu session={session}>
        <Search />
        <div className="pt-4 space-y-4 flex-1 overflow-auto scrollable-menu-shadow">
          <AlertLensLinks />
        </div>
        <UserInfo session={session} />
      </Menu>
      <MinimizeMenuButton />
    </>
  );
}

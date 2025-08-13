import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAuthContext } from "@/context/UserContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LayoutDashboard, Loader2, AlertTriangle, History, Settings, ChevronDown, LogOut, Code } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const { signOut } = useAuth();
  const { user } = useAuthContext();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const currentPath = location.pathname;
  
  const [invoiceCounts, setInvoiceCounts] = useState({
    total: 0,
    processing: 0,
    failed: 0
  });

  useEffect(() => {
    const fetchInvoiceCounts = async () => {
      try {
        // Get total count
        const { count: totalCount } = await supabase
          .from('invoices')
          .select('*', { count: 'exact', head: true });

        // Get processing count  
        const { count: processingCount } = await supabase
          .from('invoices')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'processing');

        // Get failed count
        const { count: failedCount } = await supabase
          .from('invoices')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'failed');

        setInvoiceCounts({
          total: totalCount || 0,
          processing: processingCount || 0,
          failed: failedCount || 0
        });
      } catch (error) {
        console.error('Error fetching invoice counts:', error);
      }
    };

    fetchInvoiceCounts();

    // Real-time subscription for invoice count updates
    const channel = supabase
      .channel('invoice-counts-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invoices'
        },
        () => {
          fetchInvoiceCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const onLogout = async () => {
    await signOut();
    window.location.href = "/login";
  };

  const isActive = (path: string) => currentPath === path;
  const getNavCls = (active: boolean) =>
    active ? "bg-accent text-accent-foreground font-medium" : "hover:bg-accent/50";

  const navItems = [
    { 
      title: "Dashboard", 
      url: "/app", 
      icon: LayoutDashboard,
      badge: invoiceCounts.total > 0 ? invoiceCounts.total : null
    },
    { 
      title: "Processing", 
      url: "/app/processing", 
      icon: Loader2,
      badge: invoiceCounts.processing > 0 ? invoiceCounts.processing : null,
      badgeVariant: "secondary" as const
    },
    { 
      title: "Failed", 
      url: "/app/failed", 
      icon: AlertTriangle,
      badge: invoiceCounts.failed > 0 ? invoiceCounts.failed : null,
      badgeVariant: "destructive" as const
    },
    { 
      title: "History", 
      url: "/app/history", 
      icon: History
    },
    { 
      title: "Sparsowane dane", 
      url: "/app/parsed-data", 
      icon: Code
    },
    { 
      title: "Settings", 
      url: "/app/settings", 
      icon: Settings
    },
  ];

  return (
    <Sidebar className={collapsed ? "w-14" : "w-60"}>
      <SidebarContent>
        {/* Logo/Brand */}
        <div className="p-4 border-b">
          <Link to="/app" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary/10 grid place-items-center text-primary">FB</div>
            {!collapsed && <span className="font-bold">FakturBot</span>}
          </Link>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link 
                      to={item.url} 
                      className={`flex items-center gap-2 px-3 py-2 rounded-md ${getNavCls(isActive(item.url))}`}
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && (
                        <>
                          <span>{item.title}</span>
                          {item.badge && (
                            <Badge 
                              variant={item.badgeVariant || "default"} 
                              className="ml-auto"
                            >
                              {item.badge}
                            </Badge>
                          )}
                        </>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-3 p-3 border-t">
          <div className="h-10 w-10 rounded-md bg-muted" />
          {!collapsed && (
            <>
              <div className="text-sm flex-1">
                <div className="font-medium truncate">{user?.email ?? "Użytkownik"}</div>
                <div className="text-muted-foreground truncate text-xs">FakturBot</div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="User menu">
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  align="end" 
                  side="top" 
                  sideOffset={8}
                  className="z-[9999] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg min-w-[140px]"
                >
                  <DropdownMenuItem onClick={onLogout} className="cursor-pointer">
                    <LogOut className="h-4 w-4 mr-2" /> Wyloguj
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
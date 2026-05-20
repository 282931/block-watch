import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: {
    signIn: '/login',
    newUser: '/register',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith('/dashboard');
      const isOnLogin = nextUrl.pathname === '/login';

      if (isLoggedIn) {
        if (isOnLogin || nextUrl.pathname === '/') {
          return Response.redirect(new URL('/dashboard', nextUrl));
        }
        return true;
      }

      // 未登录用户只能访问 login 和 register 页面
      if (isOnLogin || nextUrl.pathname === '/register') {
        return true;
      }

      return false; // 其他页面重定向到 login
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.name = token.name as string;
      }
      return session;
    },
  },
  providers: [], // Add providers with an empty array for now
} satisfies NextAuthConfig;

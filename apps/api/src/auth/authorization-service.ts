import { logger } from '../utils/logger';
import { RedisService } from '../services/redis';

// =============================================================================
// ROLE-BASED AUTHORIZATION SERVICE (Enterprise-Grade Permissions)
// Master Plan: Granular permissions with role hierarchy and dynamic policies
// =============================================================================

export interface Permission {
  id: string;
  name: string;
  description: string;
  resource: string;
  action: string;
  conditions?: PermissionCondition[];
}

export interface PermissionCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'nin' | 'contains' | 'regex';
  value: any;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  inherits?: string[]; // Role inheritance
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  email: string;
  roles: string[];
  permissions: string[]; // Direct permissions
  attributes: Record<string, any>; // User attributes for condition evaluation
}

export interface AuthorizationContext {
  user: User;
  resource: string;
  action: string;
  resourceData?: any;
  environment?: Record<string, any>;
}

export interface AuthorizationResult {
  allowed: boolean;
  reason?: string;
  matchedPermissions: string[];
  deniedBy?: string;
}

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  effect: 'allow' | 'deny';
  conditions: PermissionCondition[];
  priority: number;
}

// =============================================================================
// AUTHORIZATION SERVICE IMPLEMENTATION
// =============================================================================

export class AuthorizationService {
  private static instance: AuthorizationService;
  private redisService: RedisService;
  private permissions: Map<string, Permission> = new Map();
  private roles: Map<string, Role> = new Map();
  private policies: Map<string, PolicyRule> = new Map();

  private constructor() {
    this.redisService = RedisService.getInstance();
    this.initializeDefaultRolesAndPermissions();
    logger.info('Authorization Service initialized');
  }

  public static getInstance(): AuthorizationService {
    if (!AuthorizationService.instance) {
      AuthorizationService.instance = new AuthorizationService();
    }
    return AuthorizationService.instance;
  }

  // =============================================================================
  // MAIN AUTHORIZATION METHODS
  // =============================================================================

  async authorize(context: AuthorizationContext): Promise<AuthorizationResult> {
    logger.debug('Authorizing request', {
      userId: context.user.id,
      resource: context.resource,
      action: context.action,
    });

    try {
      // Get all user permissions (direct + role-based)
      const userPermissions = await this.getUserPermissions(context.user);

      // Check for explicit deny policies first
      const denyResult = await this.checkDenyPolicies(context, userPermissions);
      if (denyResult.denied) {
        return {
          allowed: false,
          reason: denyResult.reason,
          matchedPermissions: [],
          deniedBy: denyResult.deniedBy,
        };
      }

      // Check for matching permissions
      const matchedPermissions: string[] = [];
      
      for (const permissionId of userPermissions) {
        const permission = this.permissions.get(permissionId);
        if (!permission) continue;

        // Check if permission matches resource and action
        if (this.matchesResourceAction(permission, context.resource, context.action)) {
          // Evaluate conditions if present
          if (permission.conditions && permission.conditions.length > 0) {
            const conditionsMet = await this.evaluateConditions(permission.conditions, context);
            if (conditionsMet) {
              matchedPermissions.push(permissionId);
            }
          } else {
            // No conditions, permission matches
            matchedPermissions.push(permissionId);
          }
        }
      }

      // Check allow policies
      const allowResult = await this.checkAllowPolicies(context, userPermissions);
      if (allowResult.allowed) {
        matchedPermissions.push(...allowResult.matchedPolicies);
      }

      const allowed = matchedPermissions.length > 0 || allowResult.allowed;

      logger.debug('Authorization result', {
        userId: context.user.id,
        resource: context.resource,
        action: context.action,
        allowed,
        matchedPermissions: matchedPermissions.length,
      });

      return {
        allowed,
        reason: allowed ? 'Permission granted' : 'No matching permissions found',
        matchedPermissions,
      };

    } catch (error) {
      logger.error('Authorization error', {
        userId: context.user.id,
        resource: context.resource,
        action: context.action,
        error: error.message,
      });

      return {
        allowed: false,
        reason: 'Authorization system error',
        matchedPermissions: [],
      };
    }
  }

  async hasPermission(userId: string, resource: string, action: string, resourceData?: any): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) {
      return false;
    }

    const context: AuthorizationContext = {
      user,
      resource,
      action,
      resourceData,
    };

    const result = await this.authorize(context);
    return result.allowed;
  }

  async hasAnyPermission(userId: string, permissions: Array<{ resource: string; action: string }>): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) {
      return false;
    }

    for (const perm of permissions) {
      const context: AuthorizationContext = {
        user,
        resource: perm.resource,
        action: perm.action,
      };

      const result = await this.authorize(context);
      if (result.allowed) {
        return true;
      }
    }

    return false;
  }

  async hasAllPermissions(userId: string, permissions: Array<{ resource: string; action: string }>): Promise<boolean> {
    const user = await this.getUser(userId);
    if (!user) {
      return false;
    }

    for (const perm of permissions) {
      const context: AuthorizationContext = {
        user,
        resource: perm.resource,
        action: perm.action,
      };

      const result = await this.authorize(context);
      if (!result.allowed) {
        return false;
      }
    }

    return true;
  }

  // =============================================================================
  // PERMISSION MANAGEMENT
  // =============================================================================

  async createPermission(permission: Omit<Permission, 'id'>): Promise<Permission> {
    const id = `perm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newPermission: Permission = {
      id,
      ...permission,
    };

    this.permissions.set(id, newPermission);
    await this.cachePermission(newPermission);

    logger.info('Permission created', {
      permissionId: id,
      name: permission.name,
      resource: permission.resource,
      action: permission.action,
    });

    return newPermission;
  }

  async updatePermission(id: string, updates: Partial<Permission>): Promise<Permission | null> {
    const permission = this.permissions.get(id);
    if (!permission) {
      return null;
    }

    const updatedPermission = { ...permission, ...updates };
    this.permissions.set(id, updatedPermission);
    await this.cachePermission(updatedPermission);

    logger.info('Permission updated', { permissionId: id });
    return updatedPermission;
  }

  async deletePermission(id: string): Promise<boolean> {
    const permission = this.permissions.get(id);
    if (!permission || permission.resource === 'system') {
      return false; // Cannot delete system permissions
    }

    this.permissions.delete(id);
    await this.removeCachedPermission(id);

    logger.info('Permission deleted', { permissionId: id });
    return true;
  }

  getPermission(id: string): Permission | undefined {
    return this.permissions.get(id);
  }

  getAllPermissions(): Permission[] {
    return Array.from(this.permissions.values());
  }

  // =============================================================================
  // ROLE MANAGEMENT
  // =============================================================================

  async createRole(role: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>): Promise<Role> {
    const id = `role_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newRole: Role = {
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...role,
    };

    this.roles.set(id, newRole);
    await this.cacheRole(newRole);

    logger.info('Role created', {
      roleId: id,
      name: role.name,
      permissions: role.permissions.length,
    });

    return newRole;
  }

  async updateRole(id: string, updates: Partial<Role>): Promise<Role | null> {
    const role = this.roles.get(id);
    if (!role) {
      return null;
    }

    const updatedRole = {
      ...role,
      ...updates,
      updatedAt: new Date(),
    };

    this.roles.set(id, updatedRole);
    await this.cacheRole(updatedRole);

    logger.info('Role updated', { roleId: id });
    return updatedRole;
  }

  async deleteRole(id: string): Promise<boolean> {
    const role = this.roles.get(id);
    if (!role || role.isSystem) {
      return false; // Cannot delete system roles
    }

    this.roles.delete(id);
    await this.removeCachedRole(id);

    logger.info('Role deleted', { roleId: id });
    return true;
  }

  getRole(id: string): Role | undefined {
    return this.roles.get(id);
  }

  getAllRoles(): Role[] {
    return Array.from(this.roles.values());
  }

  async addPermissionToRole(roleId: string, permissionId: string): Promise<boolean> {
    const role = this.roles.get(roleId);
    const permission = this.permissions.get(permissionId);

    if (!role || !permission) {
      return false;
    }

    if (!role.permissions.includes(permissionId)) {
      role.permissions.push(permissionId);
      role.updatedAt = new Date();
      await this.cacheRole(role);

      logger.info('Permission added to role', { roleId, permissionId });
    }

    return true;
  }

  async removePermissionFromRole(roleId: string, permissionId: string): Promise<boolean> {
    const role = this.roles.get(roleId);
    if (!role) {
      return false;
    }

    const index = role.permissions.indexOf(permissionId);
    if (index > -1) {
      role.permissions.splice(index, 1);
      role.updatedAt = new Date();
      await this.cacheRole(role);

      logger.info('Permission removed from role', { roleId, permissionId });
    }

    return true;
  }

  // =============================================================================
  // USER PERMISSION RESOLUTION
  // =============================================================================

  async getUserPermissions(user: User): Promise<string[]> {
    const allPermissions = new Set<string>();

    // Add direct permissions
    user.permissions.forEach(perm => allPermissions.add(perm));

    // Add role-based permissions (with inheritance)
    for (const roleId of user.roles) {
      const rolePermissions = await this.getRolePermissions(roleId);
      rolePermissions.forEach(perm => allPermissions.add(perm));
    }

    return Array.from(allPermissions);
  }

  private async getRolePermissions(roleId: string, visited: Set<string> = new Set()): Promise<string[]> {
    // Prevent circular inheritance
    if (visited.has(roleId)) {
      return [];
    }
    visited.add(roleId);

    const role = this.roles.get(roleId);
    if (!role) {
      return [];
    }

    const permissions = new Set<string>(role.permissions);

    // Add inherited permissions
    if (role.inherits) {
      for (const inheritedRoleId of role.inherits) {
        const inheritedPermissions = await this.getRolePermissions(inheritedRoleId, visited);
        inheritedPermissions.forEach(perm => permissions.add(perm));
      }
    }

    return Array.from(permissions);
  }

  // =============================================================================
  // CONDITION EVALUATION
  // =============================================================================

  private async evaluateConditions(conditions: PermissionCondition[], context: AuthorizationContext): Promise<boolean> {
    for (const condition of conditions) {
      if (!await this.evaluateCondition(condition, context)) {
        return false; // All conditions must be true
      }
    }
    return true;
  }

  private async evaluateCondition(condition: PermissionCondition, context: AuthorizationContext): Promise<boolean> {
    const value = this.getContextValue(condition.field, context);
    
    switch (condition.operator) {
      case 'eq':
        return value === condition.value;
      case 'ne':
        return value !== condition.value;
      case 'gt':
        return value > condition.value;
      case 'lt':
        return value < condition.value;
      case 'gte':
        return value >= condition.value;
      case 'lte':
        return value <= condition.value;
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(value);
      case 'nin':
        return Array.isArray(condition.value) && !condition.value.includes(value);
      case 'contains':
        return typeof value === 'string' && value.includes(condition.value);
      case 'regex':
        return typeof value === 'string' && new RegExp(condition.value).test(value);
      default:
        return false;
    }
  }

  private getContextValue(field: string, context: AuthorizationContext): any {
    const parts = field.split('.');
    let value: any = context;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  // =============================================================================
  // POLICY EVALUATION
  // =============================================================================

  private async checkDenyPolicies(context: AuthorizationContext, userPermissions: string[]): Promise<{ denied: boolean; reason?: string; deniedBy?: string }> {
    const denyPolicies = Array.from(this.policies.values())
      .filter(policy => policy.effect === 'deny')
      .sort((a, b) => b.priority - a.priority); // Higher priority first

    for (const policy of denyPolicies) {
      const conditionsMet = await this.evaluateConditions(policy.conditions, context);
      if (conditionsMet) {
        return {
          denied: true,
          reason: `Denied by policy: ${policy.name}`,
          deniedBy: policy.id,
        };
      }
    }

    return { denied: false };
  }

  private async checkAllowPolicies(context: AuthorizationContext, userPermissions: string[]): Promise<{ allowed: boolean; matchedPolicies: string[] }> {
    const allowPolicies = Array.from(this.policies.values())
      .filter(policy => policy.effect === 'allow')
      .sort((a, b) => b.priority - a.priority); // Higher priority first

    const matchedPolicies: string[] = [];

    for (const policy of allowPolicies) {
      const conditionsMet = await this.evaluateConditions(policy.conditions, context);
      if (conditionsMet) {
        matchedPolicies.push(policy.id);
      }
    }

    return {
      allowed: matchedPolicies.length > 0,
      matchedPolicies,
    };
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  private matchesResourceAction(permission: Permission, resource: string, action: string): boolean {
    // Support wildcards
    const resourceMatch = permission.resource === '*' || permission.resource === resource;
    const actionMatch = permission.action === '*' || permission.action === action;
    
    return resourceMatch && actionMatch;
  }

  private async getUser(userId: string): Promise<User | null> {
    // This would typically fetch from database
    // For now, return a mock user
    return {
      id: userId,
      email: 'user@example.com',
      roles: ['user'],
      permissions: [],
      attributes: {},
    };
  }

  // =============================================================================
  // CACHING METHODS
  // =============================================================================

  private async cachePermission(permission: Permission): Promise<void> {
    const key = `permission:${permission.id}`;
    await this.redisService.setex(key, 3600, JSON.stringify(permission)); // 1 hour cache
  }

  private async removeCachedPermission(id: string): Promise<void> {
    const key = `permission:${id}`;
    await this.redisService.del(key);
  }

  private async cacheRole(role: Role): Promise<void> {
    const key = `role:${role.id}`;
    await this.redisService.setex(key, 3600, JSON.stringify(role)); // 1 hour cache
  }

  private async removeCachedRole(id: string): Promise<void> {
    const key = `role:${id}`;
    await this.redisService.del(key);
  }

  // =============================================================================
  // INITIALIZATION
  // =============================================================================

  private initializeDefaultRolesAndPermissions(): void {
    // System Permissions
    const systemPermissions: Permission[] = [
      {
        id: 'system.admin.all',
        name: 'System Administrator',
        description: 'Full system access',
        resource: '*',
        action: '*',
      },
      {
        id: 'user.profile.read',
        name: 'Read User Profile',
        description: 'Read user profile information',
        resource: 'user',
        action: 'read',
      },
      {
        id: 'user.profile.update',
        name: 'Update User Profile',
        description: 'Update user profile information',
        resource: 'user',
        action: 'update',
      },
      {
        id: 'automation.task.create',
        name: 'Create Automation Task',
        description: 'Create new automation tasks',
        resource: 'automation',
        action: 'create',
      },
      {
        id: 'automation.task.read',
        name: 'Read Automation Task',
        description: 'Read automation task details',
        resource: 'automation',
        action: 'read',
      },
      {
        id: 'automation.task.execute',
        name: 'Execute Automation Task',
        description: 'Execute automation tasks',
        resource: 'automation',
        action: 'execute',
      },
      {
        id: 'workflow.create',
        name: 'Create Workflow',
        description: 'Create new workflows',
        resource: 'workflow',
        action: 'create',
      },
      {
        id: 'workflow.read',
        name: 'Read Workflow',
        description: 'Read workflow details',
        resource: 'workflow',
        action: 'read',
      },
      {
        id: 'workflow.update',
        name: 'Update Workflow',
        description: 'Update existing workflows',
        resource: 'workflow',
        action: 'update',
      },
      {
        id: 'workflow.delete',
        name: 'Delete Workflow',
        description: 'Delete workflows',
        resource: 'workflow',
        action: 'delete',
      },
    ];

    // System Roles
    const systemRoles: Role[] = [
      {
        id: 'admin',
        name: 'Administrator',
        description: 'System administrator with full access',
        permissions: ['system.admin.all'],
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user',
        name: 'User',
        description: 'Regular user with basic permissions',
        permissions: [
          'user.profile.read',
          'user.profile.update',
          'automation.task.create',
          'automation.task.read',
          'automation.task.execute',
          'workflow.create',
          'workflow.read',
          'workflow.update',
        ],
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'premium',
        name: 'Premium User',
        description: 'Premium user with extended permissions',
        permissions: [
          'user.profile.read',
          'user.profile.update',
          'automation.task.create',
          'automation.task.read',
          'automation.task.execute',
          'workflow.create',
          'workflow.read',
          'workflow.update',
          'workflow.delete',
        ],
        inherits: ['user'],
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    // Initialize permissions
    systemPermissions.forEach(permission => {
      this.permissions.set(permission.id, permission);
    });

    // Initialize roles
    systemRoles.forEach(role => {
      this.roles.set(role.id, role);
    });

    logger.info('Default roles and permissions initialized', {
      permissions: systemPermissions.length,
      roles: systemRoles.length,
    });
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  getStats(): any {
    return {
      permissions: this.permissions.size,
      roles: this.roles.size,
      policies: this.policies.size,
    };
  }
}

export default AuthorizationService;
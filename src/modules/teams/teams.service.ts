import { Organization, Prisma, Team } from "@prisma/client";
import { Request } from "express";
import { prisma } from "../../infrastructure/database/prisma.client";
import { ErrorCodes } from "../../shared/errors/error-codes";
import { ConflictError, NotFoundError } from "../../shared/errors/app.error";
import { auditService } from "../audit/audit.service";
import { organizationMemberRepository } from "../auth/repositories/organization-member.repository";
import {
  TeamDto,
  TeamListResponseDto,
  TeamMemberDto,
  TeamMemberListResponseDto,
} from "./teams.dto";
import {
  AddTeamMemberInput,
  CreateTeamInput,
  UpdateTeamInput,
} from "./teams.schemas";
import { teamMemberRepository, TeamMemberWithUser } from "./repositories/team-member.repository";
import { teamRepository, TeamWithMemberCount } from "./repositories/team.repository";

export class TeamsService {
  async createTeam(
    req: Request,
    organization: Organization,
    input: CreateTeamInput,
  ): Promise<TeamDto> {
    const existing = await teamRepository.findByName(organization.id, input.name);

    if (existing) {
      throw new ConflictError(
        "A team with this name already exists",
        ErrorCodes.CONFLICT,
      );
    }

    const team = await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.team.updateMany({
          where: {
            organizationId: organization.id,
            deletedAt: null,
            isDefault: true,
          },
          data: { isDefault: false },
        });
      }

      return tx.team.create({
        data: {
          organizationId: organization.id,
          name: input.name,
          description: input.description,
          isDefault: input.isDefault ?? false,
        },
      });
    });

    await auditService.logTeamCreated(req, { id: team.id, name: team.name });

    return this.toTeamDto({ ...team, _count: { members: 0 } });
  }

  async listTeams(organizationId: string): Promise<TeamListResponseDto> {
    const teams = await teamRepository.findMany(organizationId);
    return {
      teams: teams.map((team) => this.toTeamDto(team)),
    };
  }

  async getTeam(organizationId: string, teamId: string): Promise<TeamDto> {
    const team = await this.getTeamOrThrow(organizationId, teamId);
    const members = await teamMemberRepository.findManyByTeam(team.id);

    return this.toTeamDto({
      ...team,
      _count: { members: members.length },
    });
  }

  async updateTeam(
    req: Request,
    organizationId: string,
    teamId: string,
    input: UpdateTeamInput,
  ): Promise<TeamDto> {
    const existing = await this.getTeamOrThrow(organizationId, teamId);

    if (input.name && input.name !== existing.name) {
      const duplicate = await teamRepository.findByName(organizationId, input.name);

      if (duplicate) {
        throw new ConflictError(
          "A team with this name already exists",
          ErrorCodes.CONFLICT,
        );
      }
    }

    const team = await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.team.updateMany({
          where: {
            organizationId,
            deletedAt: null,
            isDefault: true,
            id: { not: teamId },
          },
          data: { isDefault: false },
        });
      }

      return tx.team.update({
        where: { id: teamId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        },
      });
    });

    const members = await teamMemberRepository.findManyByTeam(team.id);

    await auditService.logTeamUpdated(
      req,
      team.id,
      this.serializeTeam(existing) as Prisma.InputJsonValue,
      this.serializeTeam(team) as Prisma.InputJsonValue,
    );

    return this.toTeamDto({
      ...team,
      _count: { members: members.length },
    });
  }

  async deleteTeam(
    req: Request,
    organizationId: string,
    teamId: string,
  ): Promise<{ deleted: boolean }> {
    const existing = await this.getTeamOrThrow(organizationId, teamId);
    await teamRepository.softDelete(teamId);

    await auditService.logTeamDeleted(
      req,
      existing.id,
      this.serializeTeam(existing) as Prisma.InputJsonValue,
    );

    return { deleted: true };
  }

  async addMember(
    req: Request,
    organization: Organization,
    teamId: string,
    input: AddTeamMemberInput,
  ): Promise<TeamMemberDto> {
    const team = await this.getTeamOrThrow(organization.id, teamId);

    const orgMembership = await organizationMemberRepository.findActiveByUserAndOrganization(
      input.userId,
      organization.id,
    );

    if (!orgMembership) {
      throw new NotFoundError(
        "User is not an active member of this organization",
        ErrorCodes.RESOURCE_NOT_FOUND,
      );
    }

    const existingMember = await teamMemberRepository.findByTeamAndUser(team.id, input.userId);

    if (existingMember) {
      throw new ConflictError(
        "User is already a member of this team",
        ErrorCodes.CONFLICT,
      );
    }

    const member = await teamMemberRepository.create({
      team: { connect: { id: team.id } },
      user: { connect: { id: input.userId } },
      isLead: input.isLead ?? false,
    });

    const memberWithUser = await this.getMemberWithUserOrThrow(team.id, member.id);

    await auditService.logTeamMemberAdded(req, {
      id: member.id,
      teamId: member.teamId,
      userId: member.userId,
      isLead: member.isLead,
    });

    return this.toTeamMemberDto(memberWithUser);
  }

  async removeMember(
    req: Request,
    organizationId: string,
    teamId: string,
    memberId: string,
  ): Promise<{ removed: boolean }> {
    await this.getTeamOrThrow(organizationId, teamId);

    const member = await teamMemberRepository.findById(teamId, memberId);

    if (!member) {
      throw new NotFoundError("Team member not found", ErrorCodes.RESOURCE_NOT_FOUND);
    }

    await teamMemberRepository.delete(memberId);

    await auditService.logTeamMemberRemoved(req, {
      id: member.id,
      teamId: member.teamId,
      userId: member.userId,
      isLead: member.isLead,
    });

    return { removed: true };
  }

  async listMembers(
    organizationId: string,
    teamId: string,
  ): Promise<TeamMemberListResponseDto> {
    await this.getTeamOrThrow(organizationId, teamId);

    const members = await teamMemberRepository.findManyByTeam(teamId);

    return {
      members: members.map((member) => this.toTeamMemberDto(member)),
    };
  }

  private async getTeamOrThrow(organizationId: string, teamId: string): Promise<Team> {
    const team = await teamRepository.findById(organizationId, teamId);

    if (!team) {
      throw new NotFoundError("Team not found", ErrorCodes.RESOURCE_NOT_FOUND);
    }

    return team;
  }

  private async getMemberWithUserOrThrow(
    teamId: string,
    memberId: string,
  ): Promise<TeamMemberWithUser> {
    const members = await teamMemberRepository.findManyByTeam(teamId);
    const member = members.find((item) => item.id === memberId);

    if (!member) {
      throw new NotFoundError("Team member not found", ErrorCodes.RESOURCE_NOT_FOUND);
    }

    return member;
  }

  private toTeamDto(team: Team | TeamWithMemberCount): TeamDto {
    const memberCount =
      "_count" in team ? team._count.members : 0;

    return {
      id: team.id,
      organizationId: team.organizationId,
      name: team.name,
      description: team.description,
      isDefault: team.isDefault,
      memberCount,
      createdAt: team.createdAt.toISOString(),
      updatedAt: team.updatedAt.toISOString(),
    };
  }

  private toTeamMemberDto(member: TeamMemberWithUser): TeamMemberDto {
    return {
      id: member.id,
      teamId: member.teamId,
      userId: member.userId,
      isLead: member.isLead,
      user: {
        id: member.user.id,
        email: member.user.email,
        firstName: member.user.firstName,
        lastName: member.user.lastName,
      },
      createdAt: member.createdAt.toISOString(),
      updatedAt: member.updatedAt.toISOString(),
    };
  }

  private serializeTeam(team: Team): Record<string, unknown> {
    return {
      id: team.id,
      organizationId: team.organizationId,
      name: team.name,
      description: team.description,
      isDefault: team.isDefault,
      deletedAt: team.deletedAt?.toISOString() ?? null,
    };
  }
}

export const teamsService = new TeamsService();

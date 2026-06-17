export interface TeamDto {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMemberUserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface TeamMemberDto {
  id: string;
  teamId: string;
  userId: string;
  isLead: boolean;
  user: TeamMemberUserDto;
  createdAt: string;
  updatedAt: string;
}

export interface TeamListResponseDto {
  teams: TeamDto[];
}

export interface TeamMemberListResponseDto {
  members: TeamMemberDto[];
}

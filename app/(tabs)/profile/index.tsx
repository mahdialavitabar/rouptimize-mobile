import { Button, buttonTextVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { useUpdateUser, useUser } from '@/lib/api/hooks';
import { useAuth } from '@/lib/auth';
import { BRAND, SEMANTIC, pickColor } from '@/lib/colors';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    RefreshControl,
    ScrollView,
    TouchableOpacity,
    View,
    useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function ProfileField({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | undefined | null;
  icon: keyof typeof MaterialIcons.glyphMap;
}) {
  const colorScheme = useColorScheme();
  const hasValue = !!value;

  return (
    <View className="flex-row items-center py-3 border-b border-border">
      <View
        className="w-9 h-9 rounded-full items-center justify-center mr-3"
        style={{
          backgroundColor:
            colorScheme === 'dark'
              ? `rgba(${BRAND.primaryRgb}, 0.15)`
              : `rgba(${BRAND.primaryRgb}, 0.1)`,
        }}
      >
        <MaterialIcons
          name={icon}
          size={18}
          color={pickColor(SEMANTIC.profile, colorScheme === 'dark')}
        />
      </View>
      <View className="flex-1">
        <Text className="text-xs text-muted-foreground uppercase tracking-wider">
          {label}
        </Text>
        <Text
          className={`text-base ${hasValue ? 'text-foreground font-medium' : 'text-muted-foreground/60 italic'}`}
        >
          {hasValue ? value : 'Not set'}
        </Text>
      </View>
    </View>
  );
}

export default function Profile() {
  const colorScheme = useColorScheme();
  const { user: jwtUser, signOut } = useAuth();
  const { data: user, isLoading, error, refetch } = useUser(jwtUser?.sub || '');
  const { mutate: updateUser, isLoading: isUpdating } = useUpdateUser();
  const [refreshing, setRefreshing] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
  });
  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        address: user.address || '',
      });
    }
  }, [user]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!jwtUser?.sub) return;

    try {
      const updatedUser = await updateUser({ id: jwtUser.sub, data: formData });
      if (updatedUser) {
        setFormData({
          name: updatedUser.name || '',
          email: updatedUser.email || '',
          phone: updatedUser.phone || '',
          address: updatedUser.address || '',
        });
      }
      Alert.alert('Success', 'Profile updated successfully');
    } catch {
      Alert.alert('Error', 'Failed to update profile');
    }
  };

  const handleChangePassword = async () => {
    setPasswordError(null);

    if (!passwordData.newPassword.trim()) {
      setPasswordError('Password cannot be empty');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    if (!jwtUser?.sub) return;

    try {
      await updateUser({
        id: jwtUser.sub,
        data: { password: passwordData.newPassword },
      });
      setPasswordData({ newPassword: '', confirmPassword: '' });
      setPasswordError(null);
      Alert.alert('Success', 'Password changed successfully');
    } catch {
      Alert.alert('Error', 'Failed to change password');
    }
  };

  if (isLoading && !refreshing) {
    return (
      <SafeAreaView
        className="flex-1 bg-background"
        edges={['bottom', 'left', 'right']}
      >
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" />
          <Text className="mt-3 text-muted-foreground">Loading profile…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView
        className="flex-1 bg-background"
        edges={['bottom', 'left', 'right']}
      >
        <View className="flex-1 items-center justify-center p-4">
          <MaterialIcons name="error-outline" size={48} color="#EF4444" />
          <Text className="text-destructive text-center text-lg font-medium mt-4">
            Something went wrong
          </Text>
          <Text className="mt-2 text-muted-foreground text-center">
            {error}
          </Text>
          <TouchableOpacity
            onPress={refetch}
            className="mt-6 rounded-lg bg-primary px-6 py-3"
          >
            <Text className="font-medium text-primary-foreground">
              Try Again
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={['bottom', 'left', 'right']}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          }
        >
          {user && (
            <>
              {/* Profile Header Card */}
              <Card className="mb-4">
                <CardContent className="py-6 items-center">
                  <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-3">
                    <MaterialIcons name="person" size={40} color={pickColor(SEMANTIC.profile, colorScheme === 'dark')} />
                  </View>
                  <Text className="text-xl font-bold text-foreground">
                    {user.name || user.username}
                  </Text>
                  <Text className="text-sm text-muted-foreground mt-1">
                    @{user.username}
                  </Text>
                  {user.company?.name && (
                    <View className="flex-row items-center mt-2 bg-primary/10 px-3 py-1 rounded-full">
                      <MaterialIcons
                        name="business"
                        size={14}
                        color={pickColor(SEMANTIC.company, colorScheme === 'dark')}
                      />
                      <Text className="text-primary text-xs font-medium ml-1">
                        {user.company.name}
                      </Text>
                    </View>
                  )}
                  {user.role?.name && (
                    <Text className="text-xs text-muted-foreground mt-1 capitalize">
                      {user.role.name}
                    </Text>
                  )}
                </CardContent>
              </Card>

              {/* Personal Information Card */}
              <Card className="mb-4">
                <CardHeader>
                  <View className="flex-row items-center justify-between">
                    <CardTitle>Personal Information</CardTitle>
                    <Dialog>
                      <DialogTrigger asChild>
                        <TouchableOpacity className="flex-row items-center">
                          <MaterialIcons
                            name="edit"
                            size={18}
                            color={pickColor(SEMANTIC.edit, colorScheme === 'dark')}
                          />
                          <Text className="text-primary text-sm font-medium ml-1">
                            Edit
                          </Text>
                        </TouchableOpacity>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                          <DialogTitle>Edit Profile</DialogTitle>
                          <DialogDescription>
                            Make changes to your profile here. Click save when
                            you&apos;re done.
                          </DialogDescription>
                        </DialogHeader>
                        <View className="gap-4">
                          <View>
                            <Label>Name</Label>
                            <Input
                              value={formData.name}
                              onChangeText={(text) =>
                                setFormData((prev) => ({ ...prev, name: text }))
                              }
                              placeholder="Enter your name"
                            />
                          </View>
                          <View>
                            <Label>Email</Label>
                            <Input
                              value={formData.email}
                              onChangeText={(text) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  email: text,
                                }))
                              }
                              placeholder="Enter your email"
                              keyboardType="email-address"
                              autoCapitalize="none"
                            />
                          </View>
                          <View>
                            <Label>Phone</Label>
                            <Input
                              value={formData.phone}
                              onChangeText={(text) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  phone: text,
                                }))
                              }
                              placeholder="Enter your phone"
                              keyboardType="phone-pad"
                            />
                          </View>
                          <View>
                            <Label>Address</Label>
                            <Input
                              value={formData.address}
                              onChangeText={(text) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  address: text,
                                }))
                              }
                              placeholder="Enter your address"
                            />
                          </View>
                          <Button
                            onPress={handleSave}
                            disabled={isUpdating}
                            className="mt-2"
                          >
                            {isUpdating ? (
                              <ActivityIndicator size="small" color="white" />
                            ) : (
                              <Text className={buttonTextVariants()}>
                                Save Changes
                              </Text>
                            )}
                          </Button>
                        </View>
                      </DialogContent>
                    </Dialog>
                  </View>
                </CardHeader>
                <CardContent className="gap-0">
                  <ProfileField
                    label="Full Name"
                    value={user.name}
                    icon="badge"
                  />
                  <ProfileField
                    label="Email"
                    value={user.email}
                    icon="email"
                  />
                  <ProfileField
                    label="Phone"
                    value={user.phone}
                    icon="phone"
                  />
                  <ProfileField
                    label="Address"
                    value={user.address}
                    icon="location-on"
                  />
                </CardContent>
              </Card>

              {/* Security Card */}
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle>Security</CardTitle>
                </CardHeader>
                <CardContent>
                  <Dialog>
                    <DialogTrigger asChild>
                      <TouchableOpacity className="flex-row items-center justify-between py-2">
                        <View className="flex-row items-center">
                          <MaterialIcons
                            name="lock"
                            size={20}
                            color="#6B7280"
                          />
                          <Text className="ml-3 text-foreground font-medium">
                            Change Password
                          </Text>
                        </View>
                        <MaterialIcons
                          name="chevron-right"
                          size={24}
                          color="#9CA3AF"
                        />
                      </TouchableOpacity>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle>Change Password</DialogTitle>
                        <DialogDescription>
                          Enter your new password below. Must be at least 6
                          characters.
                        </DialogDescription>
                      </DialogHeader>
                      <View className="gap-4">
                        {passwordError && (
                          <View className="bg-destructive/10 border-destructive rounded-md border p-3">
                            <Text className="text-destructive text-sm">
                              {passwordError}
                            </Text>
                          </View>
                        )}
                        <View>
                          <Label>New Password</Label>
                          <Input
                            value={passwordData.newPassword}
                            onChangeText={(text) => {
                              setPasswordError(null);
                              setPasswordData((prev) => ({
                                ...prev,
                                newPassword: text,
                              }));
                            }}
                            placeholder="Enter new password"
                            secureTextEntry
                          />
                          {passwordData.newPassword.length > 0 &&
                            passwordData.newPassword.length < 6 && (
                              <Text className="text-muted-foreground text-xs mt-1">
                                {6 - passwordData.newPassword.length} more
                                character
                                {6 - passwordData.newPassword.length !== 1
                                  ? 's'
                                  : ''}{' '}
                                needed
                              </Text>
                            )}
                        </View>
                        <View>
                          <Label>Confirm New Password</Label>
                          <Input
                            value={passwordData.confirmPassword}
                            onChangeText={(text) => {
                              setPasswordError(null);
                              setPasswordData((prev) => ({
                                ...prev,
                                confirmPassword: text,
                              }));
                            }}
                            placeholder="Confirm new password"
                            secureTextEntry
                          />
                          {passwordData.confirmPassword.length > 0 &&
                            passwordData.newPassword !==
                              passwordData.confirmPassword && (
                              <Text className="text-destructive text-xs mt-1">
                                Passwords do not match
                              </Text>
                            )}
                        </View>
                        <Button
                          onPress={handleChangePassword}
                          disabled={
                            isUpdating ||
                            !passwordData.newPassword.trim() ||
                            !passwordData.confirmPassword.trim()
                          }
                          className="mt-2"
                        >
                          {isUpdating ? (
                            <ActivityIndicator size="small" color="white" />
                          ) : (
                            <Text className={buttonTextVariants()}>
                              Change Password
                            </Text>
                          )}
                        </Button>
                      </View>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Sign Out */}
              <Button
                variant="destructive"
                onPress={handleSignOut}
                className="mb-4"
              >
                <Text className={buttonTextVariants({ variant: 'destructive' })}>
                  Sign Out
                </Text>
              </Button>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

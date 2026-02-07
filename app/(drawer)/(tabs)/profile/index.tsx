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
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Profile() {
  const { user: jwtUser, signOut } = useAuth();
  const { data: user, isLoading, error } = useUser(jwtUser?.sub || '');
  const { mutate: updateUser, isLoading: isUpdating } = useUpdateUser();

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

  const handleSignOut = async () => {
    await signOut();
  };

  const handleSave = async () => {
    if (!jwtUser?.sub) return;

    try {
      const updatedUser = await updateUser({ id: jwtUser.sub, data: formData });
      if (updatedUser) {
        // Update formData with the response
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
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }

    if (!jwtUser?.sub) return;

    try {
      await updateUser({
        id: jwtUser.sub,
        data: { password: passwordData.newPassword },
      });
      setPasswordData({ newPassword: '', confirmPassword: '' });
      Alert.alert('Success', 'Password changed successfully');
    } catch {
      Alert.alert('Error', 'Failed to change password');
    }
  };

  if (isLoading) {
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
          <Text className="text-destructive text-center text-lg font-medium">
            Something went wrong
          </Text>
          <Text className="mt-2 text-muted-foreground text-center">
            {error}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={['bottom', 'left', 'right']}
    >
      <View className="flex-1 p-4">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="gap-4">
            {user && (
              <View className="gap-4">
                <View className="flex-row">
                  <Text className="text-muted-foreground w-24">Username:</Text>
                  <Text className="font-medium">{user.username}</Text>
                </View>
                {user.company?.name && (
                  <View className="flex-row">
                    <Text className="text-muted-foreground w-24">Company:</Text>
                    <Text className="font-medium">{user.company.name}</Text>
                  </View>
                )}
                {user.role?.name && (
                  <View className="flex-row">
                    <Text className="text-muted-foreground w-24">Role:</Text>
                    <Text className="font-medium">{user.role.name}</Text>
                  </View>
                )}

                <View className="gap-2">
                  <View className="flex-row">
                    <Text className="text-muted-foreground w-24">Name:</Text>
                    <Text className="font-medium">
                      {user.name || 'Not set'}
                    </Text>
                  </View>
                  <View className="flex-row">
                    <Text className="text-muted-foreground w-24">Email:</Text>
                    <Text className="font-medium">
                      {user.email || 'Not set'}
                    </Text>
                  </View>
                  <View className="flex-row">
                    <Text className="text-muted-foreground w-24">Phone:</Text>
                    <Text className="font-medium">
                      {user.phone || 'Not set'}
                    </Text>
                  </View>
                  <View className="flex-row">
                    <Text className="text-muted-foreground w-24">Address:</Text>
                    <Text className="font-medium">
                      {user.address || 'Not set'}
                    </Text>
                  </View>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="mt-4">
                        <Text className={buttonTextVariants()}>
                          Edit Profile
                        </Text>
                      </Button>
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
                        <View className="flex-row gap-2">
                          <Button
                            onPress={handleSave}
                            disabled={isUpdating}
                            className="flex-1"
                          >
                            <Text className={buttonTextVariants()}>
                              {isUpdating ? 'Saving...' : 'Save'}
                            </Text>
                          </Button>
                        </View>
                      </View>
                    </DialogContent>
                  </Dialog>
                </View>

                <View className="gap-4 mt-4">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button>
                        <Text className={buttonTextVariants()}>
                          Change Password
                        </Text>
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle>Change Password</DialogTitle>
                        <DialogDescription>
                          Enter your new password below. Make sure it's secure.
                        </DialogDescription>
                      </DialogHeader>
                      <View className="gap-4">
                        <View>
                          <Label>New Password</Label>
                          <Input
                            value={passwordData.newPassword}
                            onChangeText={(text) =>
                              setPasswordData((prev) => ({
                                ...prev,
                                newPassword: text,
                              }))
                            }
                            placeholder="Enter new password"
                            secureTextEntry
                          />
                        </View>
                        <View>
                          <Label>Confirm New Password</Label>
                          <Input
                            value={passwordData.confirmPassword}
                            onChangeText={(text) =>
                              setPasswordData((prev) => ({
                                ...prev,
                                confirmPassword: text,
                              }))
                            }
                            placeholder="Confirm new password"
                            secureTextEntry
                          />
                        </View>
                        <Button
                          onPress={handleChangePassword}
                          disabled={isUpdating}
                        >
                          <Text className={buttonTextVariants()}>
                            {isUpdating ? 'Changing...' : 'Change Password'}
                          </Text>
                        </Button>
                      </View>
                    </DialogContent>
                  </Dialog>
                </View>
              </View>
            )}

            <Button
              variant="destructive"
              onPress={handleSignOut}
              className="mt-4"
            >
              <Text className={buttonTextVariants({ variant: 'destructive' })}>
                Sign Out
              </Text>
            </Button>
          </CardContent>
        </Card>
      </View>
    </SafeAreaView>
  );
}
